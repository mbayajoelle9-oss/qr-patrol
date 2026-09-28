const { Checkpoint, Patrol, ScanEvent, Organization, User } = require('../models');
const { SCAN_FLAGS, SCAN_STATUS, REJECTING_FLAGS, PATROL_STATUS, FLAG_LABELS } = require('../utils/constants');
const { distanceMeters, pointToLatLng } = require('../utils/geo');
const { parsePayload } = require('./qr');
const { toCentrale } = require('./realtime');
const { raiseAlert } = require('./alerts');
const { populatePatrol, emitPatrol, finalizePatrol } = require('./patrols');

/**
 * Enregistre un scan de QR Code et applique le contrôle anti-fraude.
 *
 * Chaque scan enregistre : QR + GPS + heure + identité de l'agent + téléphone.
 * Résultat : valid | suspicious (enregistré mais signalé à la centrale) | rejected.
 */
async function recordScan(agent, input) {
  const now = new Date();

  // Idempotence (renvoi d'un scan hors-ligne déjà reçu)
  if (input.clientId) {
    const already = await ScanEvent.findOne({ agent: agent._id, clientId: input.clientId });
    if (already) return buildResult(already, null, null, true);
  }

  const org = await Organization.findById(agent.organization);
  const st = org?.settings || {};
  const flags = new Set();
  const scannedAt = input.scannedAt ? new Date(input.scannedAt) : now;
  const loc = input.location && input.location.lat != null ? input.location : null;

  // ---- 1. QR Code -----------------------------------------------------------
  const parsed = parsePayload(input.payload);
  let checkpoint = null;
  if (!parsed) {
    flags.add(SCAN_FLAGS.INVALID_QR);
  } else {
    checkpoint = await Checkpoint.findOne({ _id: parsed.checkpointId, organization: agent.organization });
    if (!checkpoint) flags.add(SCAN_FLAGS.INVALID_QR);
    else if (checkpoint.qrNonce !== parsed.nonce) flags.add(SCAN_FLAGS.REVOKED_QR);
    else if (!checkpoint.active) flags.add(SCAN_FLAGS.CHECKPOINT_INACTIVE);
  }

  // ---- 2. Affectation au site ------------------------------------------------
  if (checkpoint && agent.sites?.length && !agent.sites.map(String).includes(String(checkpoint.site))) {
    flags.add(SCAN_FLAGS.UNASSIGNED_SITE);
  }

  // ---- 3. Ronde concernée ------------------------------------------------------
  let patrol = null;
  if (checkpoint && !flags.has(SCAN_FLAGS.INVALID_QR)) {
    if (input.patrolId) {
      patrol = await Patrol.findOne({ _id: input.patrolId, agent: agent._id });
    }
    if (!patrol) {
      patrol = await Patrol.findOne({
        agent: agent._id,
        status: PATROL_STATUS.IN_PROGRESS,
        'checkpoints.checkpoint': checkpoint._id,
      });
    }
    if (!patrol) {
      patrol = await Patrol.findOne({ agent: agent._id, status: PATROL_STATUS.IN_PROGRESS });
    }
    if (patrol) {
      if (String(patrol.site) !== String(checkpoint.site)) {
        flags.add(SCAN_FLAGS.WRONG_SITE);
      } else {
        const entry = patrol.checkpoints.find((c) => String(c.checkpoint) === String(checkpoint._id));
        if (!entry) flags.add(SCAN_FLAGS.NOT_IN_ROUTE);
        if (entry && patrol.populated('route') == null) await patrol.populate('route', 'strictOrder name');
        if (entry && patrol.route?.strictOrder) {
          const before = patrol.checkpoints.filter((c) => c.order < entry.order && !c.optional);
          if (before.some((c) => c.status === 'pending')) flags.add(SCAN_FLAGS.OUT_OF_ORDER);
        }
        if (patrol.dueBy && scannedAt > patrol.dueBy) flags.add(SCAN_FLAGS.OUTSIDE_WINDOW);
      }
    }
  }

  // ---- 4. GPS ---------------------------------------------------------------------
  let distance = null;
  if (checkpoint) {
    const cpLatLng = pointToLatLng(checkpoint.location);
    const radius = checkpoint.radius || st.defaultCheckpointRadius || 50;
    if (!loc) {
      if (checkpoint.requireGps) flags.add(SCAN_FLAGS.GPS_MISSING);
    } else {
      if (loc.mocked) flags.add(SCAN_FLAGS.MOCK_LOCATION);
      if (loc.accuracy != null && loc.accuracy > (st.maxGpsAccuracy || 60)) flags.add(SCAN_FLAGS.LOW_ACCURACY);
      if (cpLatLng) {
        distance = distanceMeters(cpLatLng, loc);
        // On tolère l'imprécision GPS, plafonnée au rayon du point
        const tolerance = Math.min(loc.accuracy || 0, radius);
        if (distance > radius + tolerance) flags.add(SCAN_FLAGS.GPS_TOO_FAR);
      }
    }
  }

  // ---- 5. Téléphone lié --------------------------------------------------------
  const deviceId = input.device?.deviceId;
  if (agent.boundDevice?.deviceId && deviceId && agent.boundDevice.deviceId !== deviceId) {
    flags.add(SCAN_FLAGS.UNKNOWN_DEVICE);
  }

  // ---- 6. Horodatage -----------------------------------------------------------
  const skewMs = (st.maxClockSkewMinutes || 10) * 60000;
  if (scannedAt.getTime() > now.getTime() + skewMs) flags.add(SCAN_FLAGS.CLOCK_SKEW);
  if (input.offline) {
    if (now - scannedAt > (st.offlineScanMaxHours || 24) * 3600000) flags.add(SCAN_FLAGS.CLOCK_SKEW);
  } else if (Math.abs(now - scannedAt) > skewMs) {
    flags.add(SCAN_FLAGS.CLOCK_SKEW);
  }

  // ---- 7. Doublon et vitesse impossible -------------------------------------
  if (checkpoint) {
    const dupWindow = (st.duplicateScanMinutes || 5) * 60000;
    const dup = await ScanEvent.exists({
      agent: agent._id,
      checkpoint: checkpoint._id,
      status: { $ne: SCAN_STATUS.REJECTED },
      scannedAt: { $gte: new Date(scannedAt.getTime() - dupWindow), $lte: new Date(scannedAt.getTime() + dupWindow) },
    });
    if (dup) flags.add(SCAN_FLAGS.DUPLICATE);
  }
  if (loc) {
    const prev = await ScanEvent.findOne({
      agent: agent._id,
      status: { $ne: SCAN_STATUS.REJECTED },
      'location.lat': { $ne: null },
      scannedAt: { $lt: scannedAt, $gte: new Date(scannedAt.getTime() - 2 * 3600000) },
    }).sort({ scannedAt: -1 });
    if (prev?.location?.lat != null) {
      const d = distanceMeters(prev.location, loc);
      const seconds = Math.max((scannedAt - prev.scannedAt) / 1000, 1);
      // On retire l'imprécision des deux mesures avant de calculer la vitesse
      const effective = Math.max(d - (prev.location.accuracy || 0) - (loc.accuracy || 0), 0);
      if (effective > 100 && effective / seconds > (st.maxWalkingSpeed || 8)) flags.add(SCAN_FLAGS.IMPOSSIBLE_SPEED);
    }
  }

  // ---- 8. Verdict ----------------------------------------------------------------
  const flagList = [...flags];
  let status = SCAN_STATUS.VALID;
  if (flagList.some((f) => REJECTING_FLAGS.includes(f))) status = SCAN_STATUS.REJECTED;
  else if (flags.has(SCAN_FLAGS.MOCK_LOCATION) && st.rejectMockLocation) status = SCAN_STATUS.REJECTED;
  else if (flagList.length) status = SCAN_STATUS.SUSPICIOUS;

  const scan = await ScanEvent.create({
    organization: agent.organization,
    site: checkpoint?.site,
    checkpoint: checkpoint?._id,
    patrol: patrol && !flags.has(SCAN_FLAGS.WRONG_SITE) ? patrol._id : undefined,
    agent: agent._id,
    rawPayload: String(input.payload || '').slice(0, 300),
    clientId: input.clientId,
    scannedAt,
    receivedAt: now,
    offline: !!input.offline,
    location: loc ? { ...loc, capturedAt: loc.capturedAt || scannedAt } : undefined,
    distanceMeters: distance,
    device: input.device,
    status,
    flags: flagList,
    comment: input.comment,
    photo: input.photoMediaId,
  });

  // ---- 9. Mise à jour de la ronde ---------------------------------------------
  let patrolChanged = false;
  if (patrol && status !== SCAN_STATUS.REJECTED && !flags.has(SCAN_FLAGS.WRONG_SITE)) {
    const entry = patrol.checkpoints.find((c) => String(c.checkpoint) === String(checkpoint._id));
    if (entry && entry.status === 'pending') {
      entry.status = status === SCAN_STATUS.VALID ? 'done' : 'suspicious';
      entry.scannedAt = scannedAt;
      entry.scan = scan._id;
      patrol.recomputeStats();
      await patrol.save();
      patrolChanged = true;
    }
  }

  // ---- 10. Présence de l'agent -------------------------------------------------
  if (loc) {
    await User.updateOne(
      { _id: agent._id },
      { lastPosition: { ...loc, capturedAt: scannedAt }, lastSeenAt: now, onDuty: true }
    );
  }

  // ---- 11. Diffusion temps réel ----------------------------------------------
  const populated = await ScanEvent.findById(scan._id).populate([
    { path: 'agent', select: 'firstName lastName matricule' },
    { path: 'checkpoint', select: 'name code location radius' },
    { path: 'site', select: 'name code' },
  ]);
  toCentrale(agent.organization, 'scan:new', {
    ...populated.toJSON(),
    flagLabels: flagList.map((f) => FLAG_LABELS[f] || f),
  });

  if (status !== SCAN_STATUS.VALID && st.alertOnSuspiciousScan !== false) {
    await raiseAlert({
      organization: agent.organization,
      type: 'suspicious_scan',
      level: status === SCAN_STATUS.REJECTED ? 'critical' : 'warning',
      title: status === SCAN_STATUS.REJECTED ? 'Scan rejeté' : 'Contrôle suspect',
      message: `${agent.firstName} ${agent.lastName} — ${checkpoint?.name || 'QR inconnu'} : ${flagList
        .map((f) => FLAG_LABELS[f] || f)
        .join(', ')}${distance != null && flags.has(SCAN_FLAGS.GPS_TOO_FAR) ? ` (${distance} m)` : ''}`,
      site: checkpoint?.site,
      agent: agent._id,
      patrol: patrol?._id,
      scan: scan._id,
    });
  }

  if (patrolChanged) {
    const required = patrol.checkpoints.filter((c) => !c.optional);
    const allDone = required.every((c) => c.status !== 'pending');
    if (allDone) {
      await finalizePatrol(patrol, { by: 'agent' });
    } else {
      await populatePatrol(patrol);
      emitPatrol(patrol);
    }
  }

  return buildResult(populated, patrol, checkpoint, false);
}

function buildResult(scan, patrol, checkpoint, duplicateRequest) {
  const s = typeof scan.toJSON === 'function' ? scan.toJSON() : scan;
  const messages = {
    valid: 'Point de contrôle validé',
    suspicious: 'Point enregistré — contrôle signalé à la centrale',
    rejected: 'Scan refusé',
  };
  return {
    scan: s,
    status: s.status,
    message: messages[s.status],
    flags: (s.flags || []).map((f) => ({ code: f, label: FLAG_LABELS[f] || f })),
    checkpoint: checkpoint
      ? {
          id: checkpoint._id,
          name: checkpoint.name,
          code: checkpoint.code,
          instructions: checkpoint.instructions,
          requirePhoto: checkpoint.requirePhoto,
        }
      : s.checkpoint || null,
    patrol: patrol ? (typeof patrol.toJSON === 'function' ? patrol.toJSON() : patrol) : null,
    replayed: duplicateRequest,
  };
}

module.exports = { recordScan };

const { Patrol, Route, Schedule, Organization, User } = require('../models');
const { PATROL_STATUS } = require('../utils/constants');
const { zonedParts, zonedDate, parseHHmm, localDayBounds } = require('../utils/time');
const { toCentrale, toUser } = require('./realtime');
const { raiseAlert } = require('./alerts');
const { sendPush } = require('./push');

const POPULATE = [
  { path: 'site', select: 'name code location' },
  { path: 'route', select: 'name strictOrder expectedDurationMinutes' },
  { path: 'agent', select: 'firstName lastName matricule photoUrl' },
  { path: 'shift', select: 'name startTime endTime' },
  { path: 'roundType', select: 'name color' },
  { path: 'checkpoints.checkpoint', select: 'name code location radius instructions requirePhoto' },
];

async function populatePatrol(patrol) {
  return Patrol.populate(patrol, POPULATE);
}

function emitPatrol(patrol) {
  const json = typeof patrol.toJSON === 'function' ? patrol.toJSON() : patrol;
  toCentrale(patrol.organization, 'patrol:updated', json);
  const agentId = patrol.agent?._id || patrol.agent;
  if (agentId) toUser(agentId, 'patrol:updated', json);
}

/** Crée une ronde à partir d'un parcours. */
async function createPatrolFromRoute(route, fields) {
  // Base pour le chronométrage par point : l'heure planifiée du créneau (ou maintenant, ronde à la demande)
  const base = fields.scheduledStart ? new Date(fields.scheduledStart) : new Date();
  const cps = [...route.checkpoints]
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      const entry = { checkpoint: c.checkpoint, order: c.order, optional: c.optional, status: 'pending' };
      if (c.expectedOffsetMinutes != null) {
        const from = new Date(base.getTime() + c.expectedOffsetMinutes * 60000);
        entry.expectedFrom = from;
        entry.expectedTo = new Date(from.getTime() + (c.expectedWindowMinutes ?? 10) * 60000);
      }
      return entry;
    });
  const patrol = new Patrol({
    organization: route.organization,
    site: route.site,
    route: route._id,
    checkpoints: cps,
    ...fields,
  });
  patrol.recomputeStats();
  await patrol.save();
  return patrol;
}

/** L'agent démarre une ronde (planifiée existante ou nouvelle à partir d'un parcours). */
async function startPatrol(agent, { patrolId, routeId }) {
  const existing = await Patrol.findOne({ agent: agent._id, status: PATROL_STATUS.IN_PROGRESS });
  if (existing) {
    const e = new Error('Vous avez déjà une ronde en cours. Terminez-la avant d’en commencer une autre.');
    e.status = 409;
    throw e;
  }
  let patrol;
  if (patrolId) {
    patrol = await Patrol.findOne({ _id: patrolId, organization: agent.organization });
    if (!patrol) throw Object.assign(new Error('Ronde introuvable'), { status: 404 });
    if (patrol.status !== PATROL_STATUS.SCHEDULED) {
      throw Object.assign(new Error('Cette ronde n’est plus disponible'), { status: 409 });
    }
    const eligible = patrol.eligibleAgents?.map(String) || [];
    if (patrol.agent && String(patrol.agent) !== String(agent._id)) {
      throw Object.assign(new Error('Ronde attribuée à un autre agent'), { status: 403 });
    }
    if (!patrol.agent && eligible.length && !eligible.includes(String(agent._id))) {
      throw Object.assign(new Error('Vous n’êtes pas affecté à cette ronde'), { status: 403 });
    }
    patrol.agent = agent._id;
  } else if (routeId) {
    const route = await Route.findOne({ _id: routeId, organization: agent.organization, active: true });
    if (!route) throw Object.assign(new Error('Parcours introuvable'), { status: 404 });
    patrol = await createPatrolFromRoute(route, {
      agent: agent._id,
      source: 'agent',
      scheduledStart: new Date(),
      dueBy: new Date(Date.now() + (route.expectedDurationMinutes || 30) * 2 * 60000),
    });
  } else {
    throw Object.assign(new Error('patrolId ou routeId requis'), { status: 400 });
  }
  patrol.status = PATROL_STATUS.IN_PROGRESS;
  patrol.startedAt = new Date();
  await patrol.save();

  // Démarrer une ronde met automatiquement l'agent en service
  if (!agent.onDuty) {
    await User.updateOne({ _id: agent._id }, { onDuty: true, dutyStartedAt: new Date() });
    toCentrale(agent.organization, 'agent:duty', { agentId: String(agent._id), onDuty: true });
  }

  await populatePatrol(patrol);
  emitPatrol(patrol);
  return patrol;
}

/** Clôture : points non scannés = manqués ; statut completed ou incomplete. */
async function finalizePatrol(patrol, { by = 'agent', notes } = {}) {
  for (const c of patrol.checkpoints) {
    if (c.status === 'pending' && !c.optional) c.status = 'missed';
  }
  patrol.recomputeStats();
  const required = patrol.checkpoints.filter((c) => !c.optional);
  const allDone = required.every((c) => c.status === 'done' || c.status === 'suspicious');
  patrol.status = allDone ? PATROL_STATUS.COMPLETED : PATROL_STATUS.INCOMPLETE;
  patrol.endedAt = new Date();
  if (notes) patrol.notes = notes;
  await patrol.save();
  await populatePatrol(patrol);
  emitPatrol(patrol);
  if (!allDone && by !== 'silent') {
    await raiseAlert({
      organization: patrol.organization,
      type: 'patrol_missed',
      level: 'warning',
      title: 'Ronde incomplète',
      message: `${patrol.stats.missed} point(s) non contrôlé(s) sur ${patrol.stats.total} — ${patrol.route?.name || ''}`,
      site: patrol.site?._id || patrol.site,
      agent: patrol.agent?._id || patrol.agent,
      patrol: patrol._id,
    });
  }
  return patrol;
}

// ---------------------------------------------------------------------------
// Planification automatique
// ---------------------------------------------------------------------------

function slotTimesForDay(schedule, dayParts) {
  const times = [];
  for (const t of schedule.startTimes || []) {
    const p = parseHHmm(t);
    if (p) times.push(p);
  }
  const ev = schedule.every || {};
  if (ev.minutes && ev.minutes >= 10) {
    const from = parseHHmm(ev.fromTime || '00:00');
    const to = parseHHmm(ev.toTime || '23:59');
    if (from && to) {
      const fromMin = from.h * 60 + from.mi;
      let toMin = to.h * 60 + to.mi;
      if (toMin <= fromMin) toMin += 24 * 60; // créneau de nuit (ex : 18:00 → 06:00)
      for (let m = fromMin; m <= toMin; m += ev.minutes) {
        const mm = m % (24 * 60);
        times.push({ h: Math.floor(mm / 60), mi: mm % 60, nextDay: m >= 24 * 60 });
      }
    }
  }
  return times.map((t) => {
    const d = zonedDate(dayParts.year, dayParts.month, dayParts.day, t.h, t.mi);
    return t.nextDay ? new Date(d.getTime() + 24 * 3600 * 1000) : d;
  });
}

/** Génère (idempotent) les rondes des prochaines `hoursAhead` heures pour tous les plannings actifs. */
async function generateScheduledPatrols({ hoursAhead = 24, now = new Date() } = {}) {
  const horizon = new Date(now.getTime() + hoursAhead * 3600 * 1000);
  const schedules = await Schedule.find({ active: true }).populate('route');
  let created = 0;
  for (const s of schedules) {
    if (!s.route || !s.route.active) continue;
    if (s.validFrom && s.validFrom > horizon) continue;
    if (s.validUntil && s.validUntil < now) continue;
    // Jour courant et lendemain (pour couvrir l'horizon)
    for (const offsetDays of [0, 1]) {
      const dayRef = new Date(now.getTime() + offsetDays * 24 * 3600 * 1000);
      const { parts } = localDayBounds(dayRef);
      if (!s.daysOfWeek.includes(parts.dayOfWeek)) continue;
      for (const start of slotTimesForDay(s, parts)) {
        // On garde un créneau déjà commencé tant que sa fenêtre n'est pas terminée
        const due = new Date(start.getTime() + (s.windowMinutes || 60) * 60000);
        if (due <= now || start > horizon) continue;
        const slotKey = `${s._id}:${start.toISOString()}`;
        const exists = await Patrol.exists({ slotKey });
        if (exists) continue;
        try {
          await createPatrolFromRoute(s.route, {
            schedule: s._id,
            shift: s.shift || undefined,
            roundType: s.roundType || undefined,
            slotKey,
            source: 'schedule',
            eligibleAgents: s.assignedAgent ? [s.assignedAgent] : s.agents,
            agent: s.assignedAgent || (s.agents.length === 1 ? s.agents[0] : undefined),
            scheduledStart: start,
            dueBy: due,
            status: PATROL_STATUS.SCHEDULED,
          });
          created += 1;
        } catch (e) {
          if (e.code !== 11000) console.warn('[scheduler] création ronde', e.message);
        }
      }
    }
  }
  return created;
}

/** Détecte les rondes en retard (non démarrées) et manquées / dépassées. */
async function checkLateAndMissed(now = new Date()) {
  const orgs = await Organization.find({ active: true }).select('settings');
  const settingsByOrg = new Map(orgs.map((o) => [String(o._id), o.settings || {}]));

  // 1) En retard : planifiée, pas démarrée, début + tolérance dépassé
  const lateCandidates = await Patrol.find({
    status: PATROL_STATUS.SCHEDULED,
    lateAlertSent: false,
    scheduledStart: { $lte: now },
  }).populate([{ path: 'route', select: 'name' }, { path: 'site', select: 'name' }]);
  for (const p of lateCandidates) {
    const st = settingsByOrg.get(String(p.organization)) || {};
    const tol = (st.lateToleranceMinutes ?? 10) * 60000;
    if (p.scheduledStart.getTime() + tol > now.getTime()) continue;
    p.lateAlertSent = true;
    await p.save();
    if (st.alertOnLatePatrol !== false) {
      await raiseAlert({
        organization: p.organization,
        type: 'patrol_late',
        level: 'warning',
        title: 'Ronde en retard',
        message: `${p.route?.name || 'Ronde'} — ${p.site?.name || ''} non démarrée`,
        site: p.site?._id,
        agent: p.agent,
        patrol: p._id,
      });
      const targets = p.agent ? [p.agent] : p.eligibleAgents || [];
      if (targets.length) {
        await sendPush(targets, {
          title: 'Ronde en retard',
          body: `La ronde « ${p.route?.name || ''} » aurait dû commencer.`,
          data: { type: 'patrol_late', patrolId: String(p._id) },
        });
      }
    }
    toCentrale(p.organization, 'patrol:updated', p.toJSON());
  }

  // 2) Manquée : planifiée jamais démarrée, fenêtre terminée
  const missed = await Patrol.find({ status: PATROL_STATUS.SCHEDULED, dueBy: { $lte: now } }).populate([
    { path: 'route', select: 'name' },
    { path: 'site', select: 'name' },
  ]);
  for (const p of missed) {
    p.status = PATROL_STATUS.MISSED;
    p.checkpoints.forEach((c) => {
      if (!c.optional) c.status = 'missed';
    });
    p.recomputeStats();
    await p.save();
    await raiseAlert({
      organization: p.organization,
      type: 'patrol_missed',
      level: 'critical',
      title: 'Ronde manquée',
      message: `${p.route?.name || 'Ronde'} — ${p.site?.name || ''} n’a pas été effectuée`,
      site: p.site?._id,
      agent: p.agent,
      patrol: p._id,
    });
    toCentrale(p.organization, 'patrol:updated', p.toJSON());
  }

  // 3) En cours mais fenêtre largement dépassée (+50 %) : clôture automatique
  const overdue = await Patrol.find({ status: PATROL_STATUS.IN_PROGRESS, dueBy: { $lte: now } }).populate('route');
  for (const p of overdue) {
    const windowMs = p.dueBy - (p.scheduledStart || p.startedAt);
    if (now.getTime() < p.dueBy.getTime() + Math.max(windowMs * 0.5, 15 * 60000)) continue;
    await finalizePatrol(p, { by: 'system', notes: 'Clôture automatique : délai dépassé' });
  }
}

module.exports = {
  POPULATE,
  populatePatrol,
  emitPatrol,
  createPatrolFromRoute,
  startPatrol,
  finalizePatrol,
  generateScheduledPatrols,
  checkLateAndMissed,
  slotTimesForDay,
  zonedParts,
};

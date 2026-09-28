const router = require('express').Router();
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const { Organization, Patrol, Incident, Site } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { asyncHandler, badRequest } = require('../utils/http');
const { STAFF_ROLES, INCIDENT_TYPE_LABELS, SEVERITY_LABELS, INCIDENT_STATUS_LABELS } = require('../utils/constants');
const { buildSummary } = require('../services/reports');

router.use(requireOrg, requireRole(...STAFF_ROLES));

const STATUS_FR = {
  scheduled: 'Planifiée',
  in_progress: 'En cours',
  completed: 'Complète',
  incomplete: 'Incomplète',
  missed: 'Manquée',
  cancelled: 'Annulée',
};

function parsePeriod(req) {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 7 * 24 * 3600000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw badRequest('Période invalide');
  if (to - from > 366 * 24 * 3600000) throw badRequest('Période limitée à un an');
  let site;
  if (req.query.site) {
    if (!mongoose.isValidObjectId(req.query.site)) throw badRequest('Site invalide');
    site = new mongoose.Types.ObjectId(String(req.query.site));
  }
  return { from, to, site };
}

const fmt = (d) =>
  d ? new Date(d).toLocaleString('fr-FR', { timeZone: process.env.TZ || 'Africa/Kinshasa', dateStyle: 'short', timeStyle: 'short' }) : '—';
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json(await buildSummary(req.orgId, parsePeriod(req)));
  })
);

// Export CSV des rondes (ouvrable dans Excel)
router.get(
  '/patrols.csv',
  asyncHandler(async (req, res) => {
    const { from, to, site } = parsePeriod(req);
    const filter = { organization: req.orgId, scheduledStart: { $gte: from, $lte: to } };
    if (site) filter.site = site;
    const patrols = await Patrol.find(filter)
      .populate('site', 'name')
      .populate('route', 'name')
      .populate('agent', 'firstName lastName matricule')
      .sort({ scheduledStart: 1 })
      .limit(20000);
    const header = ['Date prévue', 'Site', 'Parcours', 'Agent', 'Matricule', 'Statut', 'Début', 'Fin', 'Points faits', 'Points total', 'Suspects', 'Manqués', 'Incidents'];
    const lines = patrols.map((p) =>
      [
        fmt(p.scheduledStart),
        p.site?.name,
        p.route?.name,
        p.agent ? `${p.agent.firstName} ${p.agent.lastName}` : '',
        p.agent?.matricule,
        STATUS_FR[p.status],
        fmt(p.startedAt),
        fmt(p.endedAt),
        p.stats.done,
        p.stats.total,
        p.stats.suspicious,
        p.stats.missed,
        p.stats.incidents,
      ]
        .map(csvCell)
        .join(';')
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rondes-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv"`);
    res.send(`﻿${[header.map(csvCell).join(';'), ...lines].join('\n')}`);
  })
);

// Rapport PDF d'activité
router.get(
  '/activity.pdf',
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req);
    const [summary, org, siteDoc, incidents] = await Promise.all([
      buildSummary(req.orgId, period),
      Organization.findById(req.orgId),
      period.site ? Site.findById(period.site) : null,
      Incident.find({
        organization: req.orgId,
        createdAt: { $gte: period.from, $lte: period.to },
        ...(period.site ? { site: period.site } : {}),
      })
        .populate('site', 'name')
        .populate('reportedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(100),
    ]);
    const red = org?.primaryColor || '#E92026';

    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="rapport-activite-${Date.now()}.pdf"`);
    doc.pipe(res);

    // En-tête
    doc.rect(0, 0, doc.page.width, 80).fill('#0B0B0C');
    doc.fillColor(red).font('Helvetica-Bold').fontSize(22).text((org?.name || 'QR PATROL').toUpperCase(), 40, 24);
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(10).text('Rapport d’activité des rondes de sécurité', 40, 52);
    doc
      .fillColor('#BBBBBB')
      .fontSize(9)
      .text(`Du ${fmt(period.from)} au ${fmt(period.to)}${siteDoc ? ` · Site : ${siteDoc.name}` : ' · Tous les sites'}`, 40, 52, {
        align: 'right',
        width: doc.page.width - 80,
      });
    doc.moveDown(3);
    doc.y = 100;

    // Indicateurs clés
    const kpis = [
      ['Taux de conformité', summary.patrols.complianceRate != null ? `${summary.patrols.complianceRate} %` : '—'],
      ['Rondes complètes', summary.patrols.byStatus.completed || 0],
      ['Rondes incomplètes', summary.patrols.byStatus.incomplete || 0],
      ['Rondes manquées', summary.patrols.byStatus.missed || 0],
      ['Scans valides', summary.scans.byStatus.valid || 0],
      ['Scans suspects', (summary.scans.byStatus.suspicious || 0) + (summary.scans.byStatus.rejected || 0)],
      ['Incidents', summary.incidents.total],
      ['Délai moyen de prise en charge', summary.incidents.avgAckMinutes != null ? `${summary.incidents.avgAckMinutes} min` : '—'],
    ];
    const boxW = (doc.page.width - 80 - 30) / 4;
    kpis.forEach(([label, value], i) => {
      const x = 40 + (i % 4) * (boxW + 10);
      const y = 100 + Math.floor(i / 4) * 62;
      doc.roundedRect(x, y, boxW, 52, 6).fill('#F4F4F5');
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(16).text(String(value), x + 10, y + 9, { width: boxW - 20 });
      doc.fillColor('#666').font('Helvetica').fontSize(8).text(label, x + 10, y + 32, { width: boxW - 20 });
    });
    doc.y = 240;

    const section = (title) => {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.moveDown(0.8);
      doc.fillColor(red).font('Helvetica-Bold').fontSize(12).text(title, 40);
      doc.moveTo(40, doc.y + 2).lineTo(doc.page.width - 40, doc.y + 2).strokeColor('#DDDDDD').stroke();
      doc.moveDown(0.5);
    };
    const table = (headers, rows, widths) => {
      const startX = 40;
      const drawRow = (cells, bold) => {
        if (doc.y > doc.page.height - 60) doc.addPage();
        const y = doc.y;
        let x = startX;
        let maxH = 0;
        cells.forEach((c, i) => {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(bold ? '#111' : '#333');
          const h = doc.heightOfString(String(c ?? ''), { width: widths[i] - 6 });
          doc.text(String(c ?? ''), x + 3, y, { width: widths[i] - 6 });
          maxH = Math.max(maxH, h);
          x += widths[i];
        });
        doc.y = y + maxH + 5;
        doc.x = startX;
      };
      drawRow(headers, true);
      rows.forEach((r) => drawRow(r, false));
    };

    section('Performance par agent');
    table(
      ['Agent', 'Matricule', 'Rondes', 'Complètes', 'Manquées', 'Points contrôlés', 'Suspects', 'Conformité'],
      summary.agents.map((a) => [
        a.name,
        a.matricule || '',
        a.patrols,
        a.completed,
        a.missed,
        `${a.checkpointsDone}/${a.checkpointsTotal}`,
        a.suspicious,
        a.complianceRate != null ? `${a.complianceRate} %` : '—',
      ]),
      [110, 60, 45, 55, 55, 75, 50, 65]
    );

    section('Performance par site');
    table(
      ['Site', 'Rondes', 'Complètes', 'Manquées', 'Conformité'],
      summary.sites.map((s) => [s.name, s.total, s.completed, s.missed, s.complianceRate != null ? `${s.complianceRate} %` : '—']),
      [215, 70, 70, 70, 90]
    );

    section('Anomalies détectées (anti-fraude)');
    if (!summary.scans.flags.length) doc.font('Helvetica').fontSize(9).fillColor('#333').text('Aucune anomalie sur la période.');
    else table(['Anomalie', 'Occurrences'], summary.scans.flags.map((f) => [f.label, f.count]), [300, 100]);

    section('Incidents');
    if (!incidents.length) doc.font('Helvetica').fontSize(9).fillColor('#333').text('Aucun incident sur la période.');
    else
      table(
        ['Référence', 'Date', 'Type', 'Gravité', 'Site', 'Déclaré par', 'Statut'],
        incidents.map((i) => [
          i.reference,
          fmt(i.createdAt),
          INCIDENT_TYPE_LABELS[i.type],
          SEVERITY_LABELS[i.severity],
          i.site?.name || '',
          i.reportedBy ? `${i.reportedBy.firstName} ${i.reportedBy.lastName}` : '',
          INCIDENT_STATUS_LABELS[i.status],
        ]),
        [80, 70, 80, 50, 80, 85, 70]
      );

    // Pied de page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc
        .fillColor('#999')
        .font('Helvetica')
        .fontSize(7)
        .text(`QR Patrol · généré le ${fmt(new Date())} · page ${i + 1}/${range.count}`, 40, doc.page.height - 30, {
          align: 'center',
          width: doc.page.width - 80,
          lineBreak: false,
        });
    }
    doc.end();
  })
);

module.exports = router;

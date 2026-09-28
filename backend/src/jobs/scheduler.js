const cron = require('node-cron');
const config = require('../config');
const { generateScheduledPatrols, checkLateAndMissed } = require('../services/patrols');
const { User } = require('../models');
const { ROLES } = require('../utils/constants');
const { raiseAlert } = require('../services/alerts');

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await generateScheduledPatrols({ hoursAhead: 24 });
    await checkLateAndMissed();
  } catch (e) {
    console.error('[scheduler]', e);
  } finally {
    running = false;
  }
}

// Agent en service sans signe de vie depuis 15 min -> alerte (une fois)
const offlineNotified = new Set();
async function checkSilentAgents() {
  const threshold = new Date(Date.now() - 15 * 60000);
  const silent = await User.find({
    role: ROLES.AGENT,
    onDuty: true,
    active: true,
    lastSeenAt: { $lt: threshold },
  }).select('firstName lastName organization lastSeenAt');
  const silentIds = new Set(silent.map((u) => String(u._id)));
  for (const id of offlineNotified) if (!silentIds.has(id)) offlineNotified.delete(id);
  for (const u of silent) {
    const id = String(u._id);
    if (offlineNotified.has(id)) continue;
    offlineNotified.add(id);
    await raiseAlert({
      organization: u.organization,
      type: 'agent_offline',
      level: 'warning',
      title: 'Agent sans signal',
      message: `${u.firstName} ${u.lastName} n’a plus envoyé de position depuis 15 minutes`,
      agent: u._id,
    });
  }
}

function startScheduler() {
  if (!config.schedulerEnabled) {
    console.log('[scheduler] désactivé');
    return;
  }
  cron.schedule('* * * * *', tick, { timezone: config.timezone });
  cron.schedule('*/5 * * * *', () => checkSilentAgents().catch((e) => console.error('[scheduler]', e)), {
    timezone: config.timezone,
  });
  setTimeout(tick, 3000);
  console.log('[scheduler] démarré (génération des rondes, retards, rondes manquées)');
}

module.exports = { startScheduler, tick };

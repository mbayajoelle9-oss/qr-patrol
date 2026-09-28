// Notifications push Expo (application mobile) — aucune dépendance, API HTTP d'Expo
const { User } = require('../models');

async function sendPush(userIds, { title, body, data = {}, priority = 'high' }) {
  const users = await User.find({ _id: { $in: userIds }, pushToken: { $exists: true, $ne: null } }).select('pushToken');
  const messages = users
    .filter((u) => /^Expo(nent)?PushToken\[/.test(u.pushToken || ''))
    .map((u) => ({ to: u.pushToken, title, body, data, sound: 'default', priority, channelId: 'alerts' }));
  if (!messages.length) return;
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) console.warn('[push] échec', res.status, await res.text());
  } catch (e) {
    console.warn('[push] erreur', e.message);
  }
}

module.exports = { sendPush };

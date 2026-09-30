// Intégration Outlook / Microsoft 365 (Microsoft Graph) — SCAFFOLD.
//
// Ceci n'est PAS une intégration fonctionnelle : elle nécessite une inscription d'application
// dans le portail Azure Active Directory du client (tenant, client ID, client secret — voir
// Organisation → Paramètres → « Configuration du système avec Outlook ») ainsi qu'un accès réseau
// sortant vers login.microsoftonline.com et graph.microsoft.com, indisponibles dans cet environnement
// de développement. Ce module pose l'architecture (authentification, synchronisation du planning
// hebdomadaire vers les calendriers Outlook des rondiers) pour être complété une fois ces éléments
// fournis par le client.
//
// Flux prévu (client-credentials, application-only) :
//   1. POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
//        grant_type=client_credentials, scope=https://graph.microsoft.com/.default
//   2. Pour chaque rondier ayant un e-mail et un planning actif :
//        POST /users/{mailbox ou email rondier}/calendar/events  (Microsoft Graph)
//      avec un évènement par créneau (route, heure de début, durée = expectedDurationMinutes),
//      répété chaque semaine (recurrence.pattern.type = 'weekly', daysOfWeek = jours cochés).

const https = require('https');

/** Vrai si l'organisation a activé et configuré l'intégration Outlook. */
function isConfigured(org) {
  const s = org?.settings || {};
  return !!(s.outlookEnabled && s.outlookTenantId && s.outlookClientId && s.outlookClientSecret);
}

/** Obtient un jeton d'accès Microsoft Graph (application-only, client-credentials). */
async function getAccessToken(org) {
  const s = org?.settings || {};
  if (!isConfigured(org)) throw new Error("Intégration Outlook non configurée pour cette société");
  const body = new URLSearchParams({
    client_id: s.outlookClientId,
    client_secret: s.outlookClientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  }).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://login.microsoftonline.com/${encodeURIComponent(s.outlookTenantId)}/oauth2/v2.0/token`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.access_token) resolve(json.access_token);
            else reject(new Error(json.error_description || 'Échec authentification Microsoft Graph'));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Construit les évènements de calendrier Outlook (Microsoft Graph) hebdomadaires récurrents
 * correspondant aux plannings actifs des rondiers. Ne fait AUCUN appel réseau — à brancher sur
 * getAccessToken() + un appel POST /users/{email}/calendar/events une fois l'intégration activée.
 */
function buildRecurringEventsFromSchedules(schedules) {
  return schedules
    .filter((s) => s.active && s.assignedAgent?.email)
    .flatMap((s) =>
      (s.startTimes || []).map((time) => ({
        subject: `Ronde — ${s.route?.name || s.name || 'Ronde'}`,
        attendeeEmail: s.assignedAgent.email,
        start: time,
        durationMinutes: s.route?.expectedDurationMinutes || 30,
        recurrence: { type: 'weekly', daysOfWeek: s.daysOfWeek },
      }))
    );
}

module.exports = { isConfigured, getAccessToken, buildRecurringEventsFromSchedules };

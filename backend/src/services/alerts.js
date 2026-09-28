const { Alert } = require('../models');
const { toCentrale } = require('./realtime');

/** Crée une alerte, la pousse en temps réel à la centrale et la retourne. */
async function raiseAlert(data) {
  const alert = await Alert.create(data);
  const populated = await alert.populate([
    { path: 'agent', select: 'firstName lastName matricule' },
    { path: 'site', select: 'name code' },
  ]);
  toCentrale(data.organization, 'alert:new', populated.toJSON());
  return populated;
}

module.exports = { raiseAlert };

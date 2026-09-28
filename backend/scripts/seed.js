/* eslint-disable no-console */
// Initialisation : super admin plateforme + société cliente (FAMECO) + données de démarrage
// Usage : npm run seed   (idempotent : ne recrée pas ce qui existe déjà)
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');
const { Organization, User, Site, Checkpoint, Route, Schedule, Team } = require('../src/models');
const { ROLES } = require('../src/utils/constants');
const { latLngToPoint } = require('../src/utils/geo');

async function upsertUser(filter, data, password) {
  let u = await User.findOne(filter);
  if (u) return { user: u, created: false };
  u = new User(data);
  await u.setPassword(password);
  await u.save();
  return { user: u, created: true };
}

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('Connecté à MongoDB');

  // 1. Super administrateur plateforme
  const saEmail = (process.env.SEED_SUPERADMIN_EMAIL || 'admin@rooksecurity.cd').toLowerCase();
  const saPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'ChangeMoi!2026';
  const sa = await upsertUser(
    { email: saEmail, role: ROLES.SUPER_ADMIN },
    { email: saEmail, role: ROLES.SUPER_ADMIN, firstName: 'Super', lastName: 'Admin' },
    saPassword
  );
  console.log(sa.created ? `✔ Super admin créé : ${saEmail}` : `• Super admin existant : ${saEmail}`);

  // 2. Société cliente
  const orgName = process.env.SEED_ORG_NAME || 'FAMECO';
  const orgCode = orgName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 20);
  let org = await Organization.findOne({ code: orgCode });
  if (!org) {
    org = await Organization.create({
      name: orgName,
      code: orgCode,
      primaryColor: '#E92026',
      contactEmail: 'securite@fameco.cd',
      address: 'Kinshasa, RDC',
    });
    console.log(`✔ Société créée : ${org.name} (code ${org.code})`);
  } else {
    console.log(`• Société existante : ${org.name}`);
  }

  if (process.env.SEED_DEMO_DATA === 'false') {
    await mongoose.disconnect();
    return;
  }

  const pw = 'Fameco2026!';
  const admin = await upsertUser(
    { organization: org._id, email: 'admin@fameco.cd' },
    { organization: org._id, role: ROLES.ADMIN, firstName: 'Admin', lastName: 'FAMECO', email: 'admin@fameco.cd' },
    pw
  );
  const sup = await upsertUser(
    { organization: org._id, email: 'centrale@fameco.cd' },
    { organization: org._id, role: ROLES.SUPERVISOR, firstName: 'Opérateur', lastName: 'Centrale', email: 'centrale@fameco.cd' },
    pw
  );

  // 3. Site principal + 5 points de contrôle (coordonnées indicatives à calibrer sur place)
  let site = await Site.findOne({ organization: org._id, code: 'SIEGE' });
  if (!site) {
    site = await Site.create({
      organization: org._id,
      name: 'FAMECO — Site principal',
      code: 'SIEGE',
      address: 'Kinshasa',
      location: latLngToPoint(-4.3698, 15.3431),
      geofenceRadius: 400,
      instructions: 'Contrôler les accès, la clôture et les zones de stockage acier à chaque ronde.',
    });
    console.log('✔ Site créé');
  }

  const cpDefs = [
    ['P01', 'Entrée principale', -4.36955, 15.34285, 'Vérifier la barrière et le registre des visiteurs.'],
    ['P02', 'Parking', -4.36985, 15.3433, 'Contrôler les véhicules stationnés.'],
    ['P03', 'Entrepôt acier', -4.37015, 15.34345, 'Vérifier cadenas et portes de l’entrepôt.'],
    ['P04', 'Bureaux administratifs', -4.36975, 15.34365, 'Portes et fenêtres fermées.'],
    ['P05', 'Clôture arrière', -4.3703, 15.3428, 'Inspecter la clôture et l’éclairage.'],
  ];
  const cps = [];
  for (const [code, name, lat, lng, instructions] of cpDefs) {
    let cp = await Checkpoint.findOne({ site: site._id, code });
    if (!cp) {
      cp = await Checkpoint.create({
        organization: org._id,
        site: site._id,
        code,
        name,
        instructions,
        location: latLngToPoint(lat, lng),
        radius: 40,
      });
    }
    cps.push(cp);
  }
  console.log(`✔ ${cps.length} points de contrôle`);

  // 4. Agents
  const agents = [];
  for (const [i, [fn, ln]] of [
    ['Jean', 'Mbuyi'],
    ['Patrick', 'Kabongo'],
    ['Didier', 'Lukusa'],
  ].entries()) {
    const matricule = `AG${String(i + 1).padStart(3, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const { user } = await upsertUser(
      { organization: org._id, matricule },
      { organization: org._id, role: ROLES.AGENT, firstName: fn, lastName: ln, matricule, sites: [site._id] },
      '123456'
    );
    agents.push(user);
  }
  const { user: responder } = await upsertUser(
    { organization: org._id, matricule: 'INT001' },
    { organization: org._id, role: ROLES.RESPONDER, firstName: 'Équipe', lastName: 'Alpha', matricule: 'INT001' },
    '123456'
  );

  let team = await Team.findOne({ organization: org._id, name: 'Équipe Alpha' });
  if (!team) {
    team = await Team.create({
      organization: org._id,
      name: 'Équipe Alpha',
      callSign: 'ALPHA',
      vehicle: 'Pick-up',
      members: [responder._id],
      leader: responder._id,
      sites: [site._id],
    });
    await User.updateOne({ _id: responder._id }, { team: team._id });
  }

  // 5. Parcours + planning de nuit (toutes les 2 h de 18:00 à 06:00)
  let route = await Route.findOne({ site: site._id, name: 'Ronde complète' });
  if (!route) {
    route = await Route.create({
      organization: org._id,
      site: site._id,
      name: 'Ronde complète',
      description: 'Tour complet du site',
      checkpoints: cps.map((c, i) => ({ checkpoint: c._id, order: i + 1 })),
      expectedDurationMinutes: 25,
    });
  }
  const hasSchedule = await Schedule.exists({ route: route._id });
  if (!hasSchedule) {
    await Schedule.create({
      organization: org._id,
      site: site._id,
      route: route._id,
      name: 'Rondes de nuit',
      agents: agents.map((a) => a._id),
      every: { minutes: 120, fromTime: '18:00', toTime: '06:00' },
      windowMinutes: 60,
    });
  }

  console.log('\n=== Comptes de démonstration ===');
  console.log(`Super admin     : ${saEmail} / ${sa.created ? saPassword : '(inchangé)'}`);
  console.log(`Admin FAMECO    : admin@fameco.cd / ${admin.created ? pw : '(inchangé)'}`);
  console.log(`Centrale        : centrale@fameco.cd / ${sup.created ? pw : '(inchangé)'}`);
  console.log('Agents (mobile) : AG001, AG002, AG003 / 123456');
  console.log('Intervenant     : INT001 / 123456');
  console.log('\n⚠ Changez ces mots de passe avant la mise en production.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

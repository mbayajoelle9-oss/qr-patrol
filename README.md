# QR Patrol — FAMECO

Plateforme de contrôle des rondes de sécurité : les agents scannent des QR Codes posés sur les points de contrôle, la position GPS et l’heure sont enregistrées, la centrale suit tout en temps réel, les incidents (photo, vidéo, commentaire) déclenchent des interventions.

```
qr-patrol/
├── backend/   API Node.js · Express · MongoDB (Atlas) · Socket.IO   → Render
├── web/       Centrale de sécurité + Administration · Next.js 15     → Vercel
├── mobile/    Application Agent · React Native (Expo SDK 53)         → APK via EAS
└── assets/    Logos FAMECO d’origine
```

---

## 1. Fonctionnalités

### Application Agent (mobile)
- Connexion par **matricule + code**, compte **lié au téléphone** (anti-fraude)
- **Prise / fin de service** avec suivi GPS continu (y compris écran verrouillé, service Android de premier plan)
- Rondes à effectuer (planifiées ou ordonnées par la centrale), **ronde libre**
- **Scanner QR** (lampe torche) → GPS précis → validation immédiate : ✅ validé / ⚠️ suspect / ⛔ refusé, avec la consigne du point
- Progression de la ronde point par point, photo obligatoire sur certains points
- **Déclaration d’incident** : 12 types, 4 niveaux de gravité, photos, vidéos (30 s), galerie, position
- **Bouton SOS** (maintenir 2 s) → alerte critique immédiate à la centrale avec position
- **Mode hors-ligne** : scans, incidents, SOS et positions stockés sur le téléphone puis envoyés automatiquement au retour du réseau (avec leur heure réelle)
- Historique des passages, suivi de ses incidents, notifications push
- Intervenants : missions reçues, itinéraire, « en route / sur place / terminée »

### Centrale (web)
- Tableau de bord **temps réel** : agents en service, carte (sombre / satellite / plan) des sites, points, agents et incidents
- Flux des derniers passages, rondes en cours (progression), **rondes en retard**, incidents ouverts, interventions actives
- **Alerte SOS plein écran** + signal sonore + notification du navigateur
- Incidents : workflow **Déclaré → Pris en charge → Équipe envoyée → Sur place → Résolu → Clôturé**, journal horodaté, photos/vidéos, commentaires
- Envoi d’équipes d’intervention (push sur le téléphone des intervenants)
- Rondes : historique, détail avec **tracé GPS réel de l’agent**, ronde ponctuelle ordonnée à un agent
- Passages & anomalies : revue des scans suspects (accepter / refuser) avec carte point ↔ agent
- Rapports : taux de conformité, rondes par jour, performance par agent et par site, anomalies, incidents, **export PDF et Excel (CSV)**

### Administration (web)
- Sites (géolocalisés), points de contrôle (position sur carte satellite, rayon de tolérance, consignes, photo obligatoire)
- **QR Codes signés** : affichage, **planche d’étiquettes PDF à imprimer**, révocation / régénération
- Parcours de ronde (ordre des points, ordre imposé, points facultatifs)
- **Plannings** : heures fixes ou fréquence (ex. toutes les 2 h de 18:00 à 06:00), jours, agents → rondes générées automatiquement
- Agents / opérateurs / intervenants / admins, délier un téléphone, réinitialiser un code
- Équipes d’intervention, paramètres anti-fraude, journal d’audit
- **Multi-sociétés** (super admin ROOKSECURITY) : chaque client a ses données isolées

### Anti-fraude du contrôle
Chaque scan enregistre **QR + GPS + heure + identité de l’agent + téléphone**, puis le serveur vérifie :

| Contrôle | Résultat |
|---|---|
| QR falsifié / d’un autre système (signature HMAC) | ⛔ rejeté |
| Étiquette révoquée (QR régénéré) | ⛔ rejeté |
| Point d’un autre site que la ronde en cours | ⛔ rejeté |
| Agent trop éloigné du point (rayon + précision GPS) | ⚠️ suspect |
| Position GPS simulée (Android) | ⚠️ suspect (ou rejet, paramétrable) |
| Précision GPS insuffisante / GPS absent | ⚠️ suspect |
| Téléphone différent de celui lié à l’agent | ⚠️ suspect |
| Déplacement impossible entre deux points (vitesse) | ⚠️ suspect — détecte les photos de QR |
| Scan en double, hors ordre, hors fenêtre horaire | ⚠️ suspect |
| Heure du téléphone incohérente | ⚠️ suspect |

Les scans suspects comptent dans la ronde mais remontent immédiatement à la centrale pour vérification.

---

## 2. Installation locale

Prérequis : Node.js 20+, un cluster MongoDB Atlas (ou MongoDB local), l’app **Expo Go** ou un build de développement sur un téléphone Android.

### Backend
```bash
cd backend
cp .env.example .env        # renseigner MONGODB_URI et des secrets longs
npm install
npm run seed                # super admin + FAMECO + site de démo (5 points, parcours, planning de nuit)
npm run dev                 # http://localhost:4000
```

Comptes créés par `npm run seed` :

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Super admin (ROOKSECURITY) | `SEED_SUPERADMIN_EMAIL` | `SEED_SUPERADMIN_PASSWORD` |
| Admin FAMECO | admin@fameco.cd | Fameco2026! |
| Opérateur centrale | centrale@fameco.cd | Fameco2026! |
| Agents (mobile) | AG001, AG002, AG003 | 123456 |
| Intervenant (mobile) | INT001 | 123456 |

⚠️ Changer tous ces mots de passe avant la mise en production.

### Web
```bash
cd web
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:3000
```

### Mobile
```bash
cd mobile
cp .env.example .env        # EXPO_PUBLIC_API_URL=http://<IP-du-PC-sur-le-Wi-Fi>:4000
npm install
npx expo install --fix      # aligne les versions des modules Expo sur le SDK installé
npx expo start
```
Le suivi GPS en arrière-plan et les notifications push ne fonctionnent pas dans Expo Go : utiliser un build (`eas build -p android --profile preview` → APK).

---

## 3. Mise en production

1. **MongoDB Atlas** : créer la base `qr-patrol`, autoriser l’IP 0.0.0.0/0 (Render n’a pas d’IP fixe en plan gratuit).
2. **Render** (backend) : New → Blueprint avec `backend/render.yaml`, ou Web Service manuel (root `backend`, build `npm install`, start `npm start`).
   - Variables : `MONGODB_URI`, `JWT_SECRET`, `QR_SECRET`, `MEDIA_SECRET`, `CORS_ORIGINS` (URL Vercel), `PUBLIC_API_URL` (URL Render), `TZ=Africa/Kinshasa`.
   - **`QR_SECRET` ne doit plus jamais changer** une fois les étiquettes imprimées (sinon tous les QR deviennent invalides).
   - Lancer `npm run seed` une fois (Shell Render ou en local avec le `MONGODB_URI` de production).
   - Plan gratuit : l’instance s’endort après 15 min sans trafic → les rondes planifiées et les alertes de retard sont vérifiées au réveil. **Pour une exploitation réelle, prendre au minimum le plan Starter** (toujours actif).
3. **Vercel** (web) : importer le dépôt, root `web`, variable `NEXT_PUBLIC_API_URL` = URL Render.
4. **Mobile** : `npm i -g eas-cli`, `eas login`, `eas init` (renseigne le `projectId` pour les push), ajuster l’URL dans `eas.json`, puis `eas build -p android --profile preview` (APK à distribuer) ou `--profile production` (Play Store).

## 4. Mise en place sur un site

1. Web → *Sites & points* → créer le site, placer le centre sur la carte.
2. Ajouter les points (Entrée principale, Parking, Entrepôt…) et les positionner sur la vue satellite.
3. *Imprimer toutes les étiquettes* → plastifier et poser chaque QR à son emplacement.
4. Créer un parcours (ordre de passage) puis un planning.
5. Créer les agents (matricule + code) et les affecter au site.
6. Chaque agent se connecte **sur son propre téléphone** (le téléphone est lié au compte au premier login).

## 5. Points techniques
- Photos / vidéos stockées dans MongoDB (**GridFS**), liens signés temporaires ; empreinte SHA-256 conservée comme preuve. Le quota Atlas M0 (512 Mo) suffit pour démarrer ; prévoir M10 ou un stockage objet si beaucoup de vidéos.
- Temps réel : Socket.IO (salles par société : centrale / agents / utilisateur).
- Planificateur interne (node-cron, chaque minute) : génération des rondes 24 h à l’avance, retards, rondes manquées, clôture automatique, agents sans signal. Avec plusieurs instances, mettre `SCHEDULER_ENABLED=false` sur toutes sauf une.
- Fuseau : Africa/Kinshasa pour les plannings et les rapports.

## 6. Vérifications faites / à faire
Faites : syntaxe de tous les fichiers (backend `npm run check`, TypeScript web et mobile), logique des QR signés, des fuseaux horaires et de la génération des créneaux de nuit.
À faire au premier `npm install` (le registre npm n’était pas accessible dans l’environnement de développement) : `npm run build` (web), `npx tsc --noEmit` (mobile), puis un test de bout en bout avec le compte de démo.

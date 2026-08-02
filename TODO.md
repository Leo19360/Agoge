# Agoge — Plan d'implémentation

## Phase A — Sécurité (5 tâches)
- [ ] A1 — `server/routes/auth.js` : JWT_SECRET dur → env uniquement, rate limiting, validation champs
- [ ] A2 — `server/app.js` : helmet, CORS restreint, limit JSON 1mb
- [ ] A3 — `server/routes/body.js` : validation MIME image, taille max
- [ ] A4 — `server/routes/nutrition.js` : validation food_name, unit, bornes, macros
- [ ] A5 — Frontend : utilitaire `escapeHtml` global + application partout

## Phase B — Bugs (5 tâches)
- [ ] B1 — `home.js` : nom avec trim + escapeHtml sur food_name
- [ ] B2 — `body.js` : vide champ poids après ajout
- [ ] B3 — `nutrition.js` : corriger closeModal scanner
- [ ] B4 — `sw.js` : ne cacher que les GET
- [ ] B5 — `nutrition.js` : escapeHtml sur e.message

## Phase C — Nouvelles fonctionnalités (6 tâches)
- [ ] C1 — `server/routes/nutrition.js` + `api.js` + `nutrition.js` : route `GET /api/nutrition/search?q=` + recherche locale aliments + fallback OpenFoodFacts
- [ ] C2 — `api.js` + `sessions.js` : route `GET /api/sessions/library` + sélecteur d'exercices dans création
- [ ] C3 — `server/routes/sessions.js` : route water `GET/POST /api/sessions/active` (déjà fait !), mais front `sessions.js` : workflow complet (démarrer → entraînement → finir)
- [ ] C4 — `server/routes/nutrition.js` : routes `GET/POST water_entries`, `api.js`, `home.js` : widget eau
- [ ] C5 — `server/routes/auth.js` + `api.js` + `profile.js` : routes `PUT /api/auth/notifications`, écran config notifications
- [ ] C6 — `profile.js` : photo de profil upload

## Phase D — Nettoyage
- [ ] D1 — Supprimer scripts de diagnostic obsolètes
- [ ] D2 — Supprimer server-err.log, server-out.log, test_small.tsv
- [ ] D3 — Vérifier `charts.js` (macrosChart utilisable)

## Phase E — Vérification
- [ ] E1 — `node --check` sur tous les fichiers modifiés
- [ ] E2 — Test démarrage local


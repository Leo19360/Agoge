const express = require('express');
const db = require('../db');
const { authMiddleware } = require('./auth');
const { validationResult } = require('express-validator');
const validators = require('../validators');

const router = express.Router();
router.use(authMiddleware);

async function getSessionFull(sessionId, userId) {
  const session = await db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', sessionId, userId);
  if (!session) return null;
  const exercises = await db.all('SELECT * FROM exercises WHERE session_id = ? ORDER BY sort_order, id', sessionId);
  for (const ex of exercises) {
    ex.sets = await db.all('SELECT * FROM sets WHERE exercise_id = ? ORDER BY set_number', ex.id);
  }
  session.exercises = exercises;
  session.done_exercises = exercises.filter(e => Number(e.done)).length;
  session.total_exercises = exercises.length;
  return session;
}

async function updateSessionCounts(session) {
  const exercises = await db.all('SELECT id, done FROM exercises WHERE session_id = ?', session.id);
  session.nb_exercises = exercises.length;
  session.done_exercises = exercises.filter(e => Number(e.done)).length;
  const c = await db.get('SELECT COUNT(*) as c FROM sets WHERE exercise_id IN (SELECT id FROM exercises WHERE session_id = ?)', session.id);
  session.nb_sets = Number(c.c);
  return session;
}

// Liste : programmes permanents (is_template=1) puis historique (is_template=0)
router.get('/', async (req, res) => {
  try {
    const sessions = await db.all('SELECT * FROM sessions WHERE user_id = ? ORDER BY is_template DESC, created_at DESC, id DESC', req.userId);
    for (const s of sessions) {
      await updateSessionCounts(s);
    }
    res.json(sessions);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Détail d'un programme / d'une séance d'historique
router.get('/:id(\\d+)', validators.idParam('id'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const sessionId = db.parsePositiveInt(req.params.id, 1, 1000000);
    if (!sessionId) return res.status(400).json({ error: 'Identifiant invalide' });
    const session = await getSessionFull(sessionId, req.userId);
    if (!session) return res.status(404).json({ error: 'Séance introuvable' });
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un programme permanent (réutilisable à vie)
router.post('/', validators.sessionCreate, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, notes, exercises } = req.body;
    const safeName = db.sanitizeText(name, { maxLength: 255 });
    if (!safeName) return res.status(400).json({ error: 'Nom du programme requis' });
  try {
    const info = await db.run(
      'INSERT INTO sessions (user_id, name, date, notes, is_template) VALUES (?,?,?,?,1)',
      req.userId, safeName, new Date().toISOString().slice(0, 10), db.sanitizeText(notes, { maxLength: 2000 }) || ''
    );
    const sessionId = info.lastInsertRowid;

    if (Array.isArray(exercises)) {
      let order = 0;
      for (const ex of exercises) {
        const nb = ex.nb_sets || (Array.isArray(ex.sets) ? ex.sets.length : 0) || 3;
        const exInfo = await db.run(
          'INSERT INTO exercises (session_id, name, muscle_group, nb_sets, rest_seconds, sort_order) VALUES (?,?,?,?,?,?)',
          sessionId, ex.name, ex.muscle_group || null, nb, ex.rest_seconds || 90, order++
        );
        const exId = exInfo.lastInsertRowid;
        for (let i = 1; i <= nb; i++) {
          const set = (ex.sets && ex.sets[i - 1]) || {};
          const targetReps = set.target_reps || ex.target_reps || (ex.reps ? String(ex.reps) : null);
          const targetWeight = set.target_weight !== undefined ? set.target_weight
            : (ex.target_weight !== undefined ? ex.target_weight : (ex.weight || 0));
          await db.run(
            'INSERT INTO sets (exercise_id, set_number, weight, reps, target_reps, target_weight, done) VALUES (?,?,?,?,?,?,0)',
            exId, i, targetWeight || 0, 0, targetReps || null, targetWeight || 0
          );
        }
      }
    }
    res.status(201).json(await getSessionFull(sessionId, req.userId));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier un programme (nom, exercices, groupes musculaires, objectifs)
router.put('/:id(\\d+)', validators.sessionUpdate, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const sessionId = db.parsePositiveInt(req.params.id, 1, 1000000);
    if (!sessionId) return res.status(400).json({ error: 'Identifiant invalide' });
    const session = await db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', sessionId, req.userId);
    if (!session) return res.status(404).json({ error: 'Séance introuvable' });
    const { name, notes, exercises } = req.body;
    const safeName = name === undefined ? session.name : db.sanitizeText(name, { maxLength: 255 });
    const safeNotes = notes === undefined ? session.notes : db.sanitizeText(notes, { maxLength: 2000 });
    await db.run('UPDATE sessions SET name = ?, notes = ? WHERE id = ?',
      safeName || session.name, safeNotes ?? session.notes, sessionId);

    if (Array.isArray(exercises)) {
      const oldEx = await db.all('SELECT id FROM exercises WHERE session_id = ?', sessionId);
      for (const ex of oldEx) {
        await db.run('DELETE FROM sets WHERE exercise_id = ?', ex.id);
        await db.run('DELETE FROM exercises WHERE id = ?', ex.id);
      }
      let order = 0;
      for (const ex of exercises) {
        const nb = ex.nb_sets || (Array.isArray(ex.sets) ? ex.sets.length : 0) || 3;
        const exInfo = await db.run(
          'INSERT INTO exercises (session_id, name, muscle_group, nb_sets, rest_seconds, sort_order) VALUES (?,?,?,?,?,?)',
          sessionId, db.sanitizeText(ex.name, { maxLength: 255 }) || 'Exercice', ex.muscle_group || null, nb, ex.rest_seconds || 90, order++
        );
        const exId = exInfo.lastInsertRowid;
        for (let i = 1; i <= nb; i++) {
          const set = (ex.sets && ex.sets[i - 1]) || {};
          const targetReps = set.target_reps || ex.target_reps || (ex.reps ? String(ex.reps) : null);
          const targetWeight = set.target_weight !== undefined ? set.target_weight
            : (ex.target_weight !== undefined ? ex.target_weight : (ex.weight || 0));
          await db.run(
            'INSERT INTO sets (exercise_id, set_number, weight, reps, target_reps, target_weight, done) VALUES (?,?,?,?,?,?,0)',
            exId, i, targetWeight || 0, 0, targetReps || null, targetWeight || 0
          );
        }
      }
    }
    res.json(await getSessionFull(req.params.id, req.userId));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mise à jour d'un exercice : cocher (done) OU éditer le poids par défaut
router.put('/exercises/:exId', validators.exerciseUpdate, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const ex = await db.get(`
      SELECT e.* FROM exercises e
      JOIN sessions s ON s.id = e.session_id
      WHERE e.id = ? AND s.user_id = ?
    `, req.params.exId, req.userId);
    if (!ex) return res.status(404).json({ error: 'Exercice introuvable' });

    const { done, default_weight } = req.body;

    if (done !== undefined) {
      await db.run('UPDATE exercises SET done = ? WHERE id = ?', done ? 1 : 0, req.params.exId);
    }

    // "Poids" : pré-remplit les prochaines séries (non terminées) avec ce poids par défaut
    if (default_weight !== undefined) {
      const w = parseFloat(default_weight) || 0;
      await db.run('UPDATE exercises SET name = name WHERE id = ?', req.params.exId); // no-op
      await db.run('UPDATE sets SET target_weight = ?, weight = ? WHERE exercise_id = ? AND done = 0',
        w, w, req.params.exId);
    }

    const updated = await db.get('SELECT * FROM exercises WHERE id = ?', req.params.exId);
    updated.sets = await db.all('SELECT * FROM sets WHERE exercise_id = ? ORDER BY set_number', req.params.exId);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mise à jour d'une série (poids / répétitions réalisés / fait)
router.put('/sets/:setId', validators.setUpdate, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const set = await db.get(`
      SELECT s.* FROM sets s
      JOIN exercises e ON e.id = s.exercise_id
      JOIN sessions se ON se.id = e.session_id
      WHERE s.id = ? AND se.user_id = ?
    `, req.params.setId, req.userId);
    if (!set) return res.status(404).json({ error: 'Série introuvable' });

    const { weight, reps, done, target_reps, target_weight } = req.body;
    await db.run('UPDATE sets SET weight = ?, reps = ?, done = ?, target_reps = ?, target_weight = ? WHERE id = ?',
      weight !== undefined ? weight : set.weight,
      reps !== undefined ? reps : set.reps,
      done !== undefined ? (done ? 1 : 0) : set.done,
      target_reps !== undefined ? target_reps : set.target_reps,
      target_weight !== undefined ? target_weight : set.target_weight,
      req.params.setId);

    res.json(await db.get('SELECT * FROM sets WHERE id = ?', req.params.setId));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Réinitialiser la progression d'un programme (pour recommencer)
router.post('/:id(\\d+)/reset', validators.idParam('id'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const sessionId = db.parsePositiveInt(req.params.id, 1, 1000000);
    if (!sessionId) return res.status(400).json({ error: 'Identifiant invalide' });
    const session = await db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', sessionId, req.userId);
    if (!session) return res.status(404).json({ error: 'Séance introuvable' });
    // Réinitialise le poids des séries sur l'objectif (target_weight) et décoche tout
    await db.run('UPDATE exercises SET done = 0 WHERE session_id = ?', sessionId);
    await db.run(`
      UPDATE sets s
      JOIN exercises e ON e.id = s.exercise_id
      SET s.done = 0, s.weight = s.target_weight, s.reps = 0
      WHERE e.session_id = ?
    `, sessionId);
    res.json(await getSessionFull(sessionId, req.userId));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Terminer une séance : enregistre une copie datée dans l'historique puis reset le programme
router.post('/:id(\\d+)/complete', validators.idParam('id'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const sessionId = db.parsePositiveInt(req.params.id, 1, 1000000);
    if (!sessionId) return res.status(400).json({ error: 'Identifiant invalide' });
    const session = await getSessionFull(sessionId, req.userId);
    if (!session) return res.status(404).json({ error: 'Séance introuvable' });

    const date = db.normalizeDate(req.body.date) || new Date().toISOString().slice(0, 10);
    const info = await db.run(
      'INSERT INTO sessions (user_id, name, date, notes, is_template) VALUES (?,?,?,?,0)',
      req.userId, db.sanitizeText(session.name, { maxLength: 255 }) || 'Séance', date, db.sanitizeText(session.notes, { maxLength: 2000 }) || ''
    );
    const newId = info.lastInsertRowid;

    for (const ex of session.exercises) {
      const exInfo = await db.run(
        'INSERT INTO exercises (session_id, name, muscle_group, nb_sets, rest_seconds, sort_order, done) VALUES (?,?,?,?,?,?,?)',
        newId, ex.name, ex.muscle_group, ex.nb_sets, ex.rest_seconds, ex.sort_order, 1
      );
      for (const set of ex.sets) {
        await db.run(
          'INSERT INTO sets (exercise_id, set_number, weight, reps, target_reps, target_weight, done) VALUES (?,?,?,?,?,?,1)',
          exInfo.lastInsertRowid, set.set_number, set.weight, set.reps, set.target_reps, set.target_weight
        );
      }
    }

    // Reset le programme pour la prochaine fois
    await db.run('UPDATE exercises SET done = 0 WHERE session_id = ?', req.params.id);
    await db.run(`
      UPDATE sets s
      JOIN exercises e ON e.id = s.exercise_id
      SET s.done = 0, s.weight = s.target_weight, s.reps = 0
      WHERE e.session_id = ?
    `, sessionId);

    res.status(201).json(await getSessionFull(newId, req.userId));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---- LIBRAIRIE D'EXERCICES ----
// Liste : globaux (user_id=0) + ceux créés par l'utilisateur
router.get('/library', async (req, res) => {
  try {
    const rows = await db.all(
      'SELECT * FROM exercise_library WHERE user_id = 0 OR user_id = ? ORDER BY muscle_group, name',
      req.userId
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Recherche dans la librairie (nom / muscle / catégorie)
router.get('/library/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const field = req.query.field || 'name';
    if (!q) return res.json([]);
    const allowed = { name: 'name', muscle: 'muscle_group', category: 'category' };
    const col = allowed[field] || 'name';
    const rows = await db.all(
      `SELECT * FROM exercise_library WHERE (user_id = 0 OR user_id = ?) AND ${col} LIKE ?
       ORDER BY muscle_group, name LIMIT 30`,
      req.userId, `%${q}%`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un exercice personnalisé (dans la librairie)
router.post('/library', async (req, res) => {
  const { name, muscle_group, category, description, rest_seconds } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Nom de l\'exercice requis' });
  }
  try {
    const existing = await db.get(
      'SELECT * FROM exercise_library WHERE user_id = ? AND name = ?', req.userId, name.trim()
    );
    if (existing) return res.status(409).json({ error: 'Cet exercice existe déjà dans ta librairie' });
    const info = await db.run(
      'INSERT INTO exercise_library (user_id, name, muscle_group, category, description, rest_seconds) VALUES (?,?,?,?,?,?)',
      req.userId, name.trim(), muscle_group || null, category || null, description || null, rest_seconds || 90
    );
    res.status(201).json(await db.get('SELECT * FROM exercise_library WHERE id = ?', info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---- SÉANCE ACTIVE (entraînement en cours) ----
// Démarrer une séance : marque le programme comme "en cours"
router.post('/:id(\\d+)/start', validators.idParam('id'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const session = await db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!session) return res.status(404).json({ error: 'Séance introuvable' });
    if (!session.is_template) {
      return res.status(400).json({ error: 'Seul un programme permanent peut être démarré' });
    }
    const existing = await db.get('SELECT * FROM active_sessions WHERE user_id = ?', req.userId);
    if (!existing) {
      await db.run('INSERT INTO active_sessions (user_id, session_id) VALUES (?,?)', req.userId, req.params.id);
    } else {
      await db.run('UPDATE active_sessions SET session_id = ?, started_at = NOW(), ended_at = NULL WHERE user_id = ?',
        req.params.id, req.userId);
    }
    const active = await db.get('SELECT * FROM active_sessions WHERE user_id = ?', req.userId);
    res.status(201).json({ active, session: await getSessionFull(req.params.id, req.userId) });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Quelle séance est actuellement en cours ?
router.get('/active', async (req, res) => {
  try {
    const active = await db.get('SELECT * FROM active_sessions WHERE user_id = ?', req.userId);
    if (!active) return res.json({ active: null });
    const session = await getSessionFull(active.session_id, req.userId);
    res.json({ active, session });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Terminer une séance : calcule durée, volume, séries, répétitions
router.post('/:id(\\d+)/finish', async (req, res) => {
  try {
    const active = await db.get('SELECT * FROM active_sessions WHERE user_id = ? AND session_id = ?',
      req.userId, req.params.id);
    if (!active) return res.status(404).json({ error: 'Aucune séance active' });
    const session = await getSessionFull(req.params.id, req.userId);
    if (!session) return res.status(404).json({ error: 'Séance introuvable' });

    // Durée = maintenant - started_at (minutes, minimum 1)
    const startMs = new Date(active.started_at).getTime();
    const durationMin = Math.max(1, Math.round((Date.now() - startMs) / 60000));

    // Volume = somme (poids × répétitions) des séries faites
    let volume = 0, totalSets = 0, totalReps = 0;
    for (const ex of session.exercises) {
      for (const set of ex.sets) {
        if (Number(set.done)) {
          volume += (set.weight || 0) * (set.reps || 0);
          totalSets++;
          totalReps += set.reps || 0;
        }
      }
    }

    // Copie datée dans l'historique avec les statistiques
    const info = await db.run(
      'INSERT INTO sessions (user_id, name, date, notes, is_template, duration_min, volume, total_sets, total_reps) VALUES (?,?,?,?,0,?,?,?,?)',
      req.userId, session.name, new Date().toISOString().slice(0, 10), session.notes || '', durationMin, volume, totalSets, totalReps
    );
    const newId = info.lastInsertRowid;
    for (const ex of session.exercises) {
      const exInfo = await db.run(
        'INSERT INTO exercises (session_id, name, muscle_group, nb_sets, rest_seconds, sort_order, done) VALUES (?,?,?,?,?,?,?)',
        newId, ex.name, ex.muscle_group, ex.nb_sets, ex.rest_seconds, ex.sort_order, 1
      );
      for (const set of ex.sets) {
        await db.run(
          'INSERT INTO sets (exercise_id, set_number, weight, reps, rpe, target_reps, target_weight, done) VALUES (?,?,?,?,?,?,?,?)',
          exInfo.lastInsertRowid, set.set_number, set.weight, set.reps, set.rpe || null, set.target_reps, set.target_weight, set.done
        );
      }
    }

    // Efface la séance active + reset du programme
    await db.run('DELETE FROM active_sessions WHERE user_id = ? AND session_id = ?', req.userId, req.params.id);
    await db.run('UPDATE exercises SET done = 0 WHERE session_id = ?', req.params.id);
    await db.run(`
      UPDATE sets s
      JOIN exercises e ON e.id = s.exercise_id
      SET s.done = 0, s.weight = s.target_weight, s.reps = 0
      WHERE e.session_id = ?
    `, req.params.id);

    const history = await getSessionFull(newId, req.userId);
    res.status(201).json({
      history,
      summary: { duration_min: durationMin, volume: Math.round(volume), total_sets: totalSets, total_reps: totalReps }
    });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Abandonner une séance active sans l'enregistrer
router.delete('/active', async (req, res) => {
  try {
    await db.run('DELETE FROM active_sessions WHERE user_id = ?', req.userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une séance / un programme
router.delete('/:id(\\d+)', async (req, res) => {
  try {
    const session = await db.get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!session) return res.status(404).json({ error: 'Séance introuvable' });
    await db.run('DELETE FROM sessions WHERE id = ?', req.params.id);
    await db.run('DELETE FROM active_sessions WHERE user_id = ? AND session_id = ?', req.userId, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;


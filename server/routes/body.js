const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { authMiddleware } = require('./auth');

const { body, param, validationResult } = require('express-validator');
const router = express.Router();
router.use(authMiddleware);

// Upload photos : mémoire (buffer) au lieu du disque.
// Compatible Netlify (système de fichiers éphémère) et local (Laragon).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// --- POIDS ---
router.get('/weight', async (req, res) => {
  try {
    // Tri chronologique : date puis heure d'ajout puis id (stable si plusieurs relevés le même jour)
    const entries = await db.all(
      'SELECT * FROM weight_entries WHERE user_id = ? ORDER BY date ASC, created_at ASC, id ASC',
      req.userId
    );
    res.json(entries);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/weight', [ body('weight').isFloat({ min: 1, max: 500 }), body('date').optional().isISO8601() ], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { date, weight } = req.body;
  const safeWeight = Number(weight);
  try {
    const d = db.normalizeDate(date) || new Date().toISOString().slice(0, 10);
    // Chaque validation de poids est ENREGISTRÉE (aucune suppression) :
    // on garde tous les relevés pour tracer l'évolution dans le graphique.
    const info = await db.run(
      'INSERT INTO weight_entries (user_id, date, weight) VALUES (?,?,?)',
      req.userId, d, safeWeight
    );
    res.status(201).json(await db.get('SELECT * FROM weight_entries WHERE id = ?', info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/weight/:id', [ param('id').isInt() ], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const entry = await db.get('SELECT * FROM weight_entries WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!entry) return res.status(404).json({ error: 'Entrée introuvable' });
    await db.run('DELETE FROM weight_entries WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- MESURES CORPORELLES ---
router.get('/measurements', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM body_measurements WHERE user_id = ? ORDER BY date ASC', req.userId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/measurements', [
  body('date').optional().isISO8601(),
  body('waist').optional().isFloat({ min: 0, max: 500 }),
  body('chest').optional().isFloat({ min: 0, max: 500 }),
  body('arms').optional().isFloat({ min: 0, max: 500 }),
  body('thighs').optional().isFloat({ min: 0, max: 500 }),
  body('hips').optional().isFloat({ min: 0, max: 500 }),
  body('shoulders').optional().isFloat({ min: 0, max: 500 }),
  body('notes').optional().isString().isLength({ max: 1000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { date, waist, chest, arms, thighs, hips, shoulders, notes } = req.body;
  try {
    const d = db.normalizeDate(date) || new Date().toISOString().slice(0, 10);
    const info = await db.run(
      'INSERT INTO body_measurements (user_id, date, waist, chest, arms, thighs, hips, shoulders, notes) VALUES (?,?,?,?,?,?,?,?,?)',
      req.userId, d, Number.isFinite(Number(waist)) ? Number(waist) : null, Number.isFinite(Number(chest)) ? Number(chest) : null, Number.isFinite(Number(arms)) ? Number(arms) : null, Number.isFinite(Number(thighs)) ? Number(thighs) : null, Number.isFinite(Number(hips)) ? Number(hips) : null, Number.isFinite(Number(shoulders)) ? Number(shoulders) : null, db.sanitizeText(notes, { maxLength: 1000 }) || null
    );
    res.status(201).json(await db.get('SELECT * FROM body_measurements WHERE id = ?', info.lastInsertRowid));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/measurements/:id', async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM body_measurements WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!row) return res.status(404).json({ error: 'Mesure introuvable' });
    await db.run('DELETE FROM body_measurements WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- PHOTOS ---
// Helper : construit l'objet photo renvoyé au client.
// Priorité au fichier stocké en base (photo_data), sinon au disque local (photo_path).
function photoToJson(p) {
  const obj = { ...p };
  if (p.photo_data) {
    const mime = p.photo_mime || 'image/jpeg';
    obj.url = `data:${mime};base64,${p.photo_data.toString('base64')}`;
  } else if (p.photo_path) {
    obj.url = `/uploads/${path.basename(p.photo_path)}`;
  }
  delete obj.photo_data;
  delete obj.photo_path;
  return obj;
}

router.get('/photos', async (req, res) => {
  try {
    const photos = await db.all('SELECT * FROM photos WHERE user_id = ? ORDER BY date DESC', req.userId);
    res.json(photos.map(photoToJson));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/photos', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo requise' });
  try {
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const info = await db.run(
      'INSERT INTO photos (user_id, date, photo_data, photo_mime) VALUES (?,?,?,?)',
      req.userId, date, req.file.buffer, req.file.mimetype || 'image/jpeg'
    );
    const photo = await db.get('SELECT * FROM photos WHERE id = ?', info.lastInsertRowid);
    res.status(201).json(photoToJson(photo));
  } catch (e) {
    console.error('Upload photo failed', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

router.delete('/photos/:id', async (req, res) => {
  try {
    const photo = await db.get('SELECT * FROM photos WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!photo) return res.status(404).json({ error: 'Photo introuvable' });
    await db.run('DELETE FROM photos WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;


const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { getEnv, isProduction } = require('../config');

const router = express.Router();

// JWT_SECRET : en production, il devrait être défini via l'environnement,
// mais un fallback local stable évite les blocages si la variable n'a pas encore été injectée.

let JWT_SECRET;
function getSecret() {
  if (!JWT_SECRET) {
    JWT_SECRET = getEnv('JWT_SECRET', { defaultValue: '' }) || getEnv('SESSION_SECRET', { defaultValue: '' }) || '';
    if (isProduction && !JWT_SECRET) {
      // In production we must not run with an empty secret
      throw new Error('JWT_SECRET is required in production');
    }
    if (!process.env.JWT_SECRET && !process.env.SESSION_SECRET && !JWT_SECRET) {
      console.warn('⚠️ JWT_SECRET absent, utilisation d\'un fallback local (vide) — change en production.');
    }
  }
  return JWT_SECRET || 'agoge-development-secret';
}

// Rate limiter pour routes sensibles (inscription / connexion)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 6, // limit each IP to 6 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessaie plus tard' }
});

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, getSecret(), { expiresIn: '30d' });
}

// Nettoie l'utilisateur avant envoi au client (jamais le hash)
function cleanUser(user) {
  if (!user) return null;
  const u = { ...user };
  delete u.password_hash;
  delete u.photo_data;
  if (u.photo_mime) {
    // photo peut être transmise ailleurs ; on conserve le mime pour l'upload
  }
  return u;
}

// Force du mot de passe : 8+ caractères, 1 lettre, 1 chiffre
function passwordPolicyOk(pw) {
  if (!pw || pw.length < 8) return false;
  if (!/[A-Za-z]/.test(pw)) return false;
  if (!/[0-9]/.test(pw)) return false;
  return true;
}

// Validation des champs optionnels
function validateOptionalInt(val, min, max) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseInt(val, 10);
  if (isNaN(n) || n < min || n > max) return null;
  return n;
}

// Inscription enrichie
router.post('/register', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().notEmpty().isLength({ max: 255 }),
  body('age').optional().isInt({ min: 10, max: 120 }),
  body('height').optional().isInt({ min: 100, max: 250 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { email, password, password_confirm, name, first_name, birth_date, sex, age, height, weight, goal } = req.body;
  const normalizedPassword = String(password || '').trim();
  const confirmedPassword = String(password_confirm === undefined ? password : password_confirm || '').trim();

  // Le rate limiter `authLimiter` est appliqué en tant que middleware sur la route.
  // Ne pas appeler `rateLimit()` ici (c'était une fausse vérification qui renvoyait 429).

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, mot de passe et nom sont requis' });
  }
  if (normalizedPassword !== confirmedPassword) {
    return res.status(400).json({ error: 'Les mots de passe ne correspondent pas' });
  }
  if (!passwordPolicyOk(normalizedPassword)) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre' });
  }
  try {
    const exists = await db.get('SELECT id FROM users WHERE email = ?', email.toLowerCase());
    if (exists) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }

    // Validation des champs optionnels
    const validAge = validateOptionalInt(age, 10, 120);
    const validHeight = validateOptionalInt(height, 100, 250);
    const validSex = ['male', 'female', 'M', 'F', 'homme', 'femme', null, undefined, ''].includes(sex) ? (sex || null) : null;

    const hash = bcrypt.hashSync(normalizedPassword, 10);
    const info = await db.run(
      `INSERT INTO users (email, password_hash, name, first_name, birth_date, sex, age, height, goal)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      email.toLowerCase(), hash, name, first_name || null, birth_date || null, validSex,
      validAge, validHeight, goal || null
    );
    // Poids initial
    if (weight && parseFloat(weight) > 0) {
      const d = new Date().toISOString().slice(0, 10);
      await db.run('INSERT INTO weight_entries (user_id, date, weight) VALUES (?,?,?)',
        info.lastInsertRowid, d, parseFloat(weight));
    }
    const user = await db.get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
    res.status(201).json({ token: signToken(user), user: cleanUser(user) });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Connexion
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { email, password } = req.body;

  // Le rate limiter `authLimiter` est appliqué en tant que middleware sur la route.
  // Ne pas appeler `rateLimit()` ici.

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  try {
    const user = await db.get('SELECT * FROM users WHERE email = ?', email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    res.json({ token: signToken(user), user: cleanUser(user) });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Middleware d'authentification
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const decoded = jwt.verify(token, getSecret());
    req.userId = decoded.id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// Calcule l'IMC depuis la taille et le dernier poids
async function computeImc(userId, user) {
  if (!user.height) return null;
  const lastWeight = await db.get('SELECT weight FROM weight_entries WHERE user_id = ? ORDER BY date DESC LIMIT 1', userId);
  const w = lastWeight ? Number(lastWeight.weight) : null;
  if (!w) return null;
  const hM = Number(user.height) / 100;
  return Math.round((w / (hM * hM)) * 10) / 10;
}

// Estimation du métabolisme de base (Mifflin-St Jeor) + objectif calorique
function estimateTargetCalories(user) {
  if (!user || !user.weight) return null;
  const kg = Number(user.weight);
  const cm = Number(user.height) || 170;
  const age = Number(user.age);
  if (!kg || !cm || !age) return null;
  const isMale = user.sex === 'male' || user.sex === 'M' || user.sex === 'homme' || user.sex === 'Homme';
  let bmr = 10 * kg + 6.25 * cm - 5 * age;
  bmr += isMale ? 5 : -161;
  const factor = user.goal === 'prise_masse' ? 1.15 : user.goal === 'seche' ? 1.12 : user.goal === 'force' ? 1.15 : 1.12;
  return Math.round(bmr * factor);
}

// Profil (avec IMC, objectif calorique estimé, photo)
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', req.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const imc = await computeImc(req.userId, user);
    const lastWeight = await db.get('SELECT * FROM weight_entries WHERE user_id = ? ORDER BY date DESC LIMIT 1', req.userId);
    const goals = await db.get('SELECT * FROM goals WHERE user_id = ?', req.userId);
    const profile = cleanUser(user);
    if (user.photo_data) {
      profile.photo = `data:${user.photo_mime || 'image/jpeg'};base64,${user.photo_data.toString('base64')}`;
    }
    profile.imc = imc;
    profile.current_weight = lastWeight ? Number(lastWeight.weight) : null;
    profile.estimated_calories = estimateTargetCalories({
      ...user,
      weight: lastWeight ? Number(lastWeight.weight) : null
    });
    profile.goals = goals || null;
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mise à jour du profil (texte + photo base64 optionnelle)
router.put('/profile', authMiddleware, async (req, res) => {
  const { name, first_name, birth_date, sex, age, height, goal, photo, theme } = req.body;
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', req.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    // Validation des champs
    const validAge = age !== undefined && age !== null && age !== '' ? validateOptionalInt(age, 10, 120) : user.age;
    const validHeight = height !== undefined && height !== null && height !== '' ? validateOptionalInt(height, 100, 250) : user.height;
    const validSex = (sex !== undefined && sex !== null) ? (['male', 'female', 'M', 'F', 'homme', 'femme', null, ''].includes(sex) ? (sex || null) : user.sex) : user.sex;

    await db.run(
      `UPDATE users SET name = ?, first_name = ?, birth_date = ?, sex = ?, age = ?, height = ?, goal = ?, theme = ? WHERE id = ?`,
      name ?? user.name, first_name ?? user.first_name, birth_date ?? user.birth_date, validSex,
      validAge, validHeight, goal ?? user.goal, theme ?? user.theme, req.userId
    );
    // Photo de profil optionnelle (data URL ou null pour supprimer)
    if (photo !== undefined) {
      if (typeof photo === 'string' && photo.startsWith('data:image')) {
        const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(photo);
        if (m) {
          await db.run('UPDATE users SET photo_data = ?, photo_mime = ? WHERE id = ?', Buffer.from(m[2], 'base64'), m[1], req.userId);
        }
      } else if (photo === null) {
        await db.run('UPDATE users SET photo_data = NULL, photo_mime = NULL WHERE id = ?', req.userId);
      }
    }
    const updated = await db.get('SELECT * FROM users WHERE id = ?', req.userId);
    const imc = await computeImc(req.userId, updated);
    const profile = cleanUser(updated);
    if (updated.photo_data) {
      profile.photo = `data:${updated.photo_mime || 'image/jpeg'};base64,${updated.photo_data.toString('base64')}`;
    }
    profile.imc = imc;
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;


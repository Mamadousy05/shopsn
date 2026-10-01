const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Jetons de session admin valides, gardés en mémoire (remis à zéro à chaque
// redémarrage du serveur — l'admin devra alors se reconnecter, ce qui est
// acceptable pour une petite boutique).
const validTokens = new Set();

// Le mot de passe admin vit dans .env, jamais dans le code envoyé au
// navigateur. Si le vendeur n'a rien configuré, on retombe sur "admin123"
// par défaut (à changer dès que possible).
router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD || 'admin123';
  // Comparaison à temps constant (on compare des empreintes de même taille).
  const hash = (v) => crypto.createHash('sha256').update(String(v || '')).digest();
  if (crypto.timingSafeEqual(hash(password), hash(expected))) {
    const token = crypto.randomUUID();
    validTokens.add(token);
    return res.json({ ok: true, token });
  }
  res.status(401).json({ ok: false, error: 'Mot de passe incorrect.' });
});

// Déconnexion : le jeton est invalidé côté serveur, pas seulement oublié
// par le navigateur.
router.post('/logout', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) validTokens.delete(token);
  res.json({ ok: true });
});

// Middleware à poser devant toute route réservée à l'admin (gestion des
// produits, consultation de toutes les commandes, export CSV, etc.).
// Le jeton peut être fourni soit dans l'en-tête x-admin-token, soit dans
// un paramètre ?token= (utile pour les liens de téléchargement classiques).
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token && validTokens.has(token)) return next();
  res.status(401).json({ error: "Accès admin requis. Merci de vous reconnecter." });
}

module.exports = router;
module.exports.requireAdmin = requireAdmin;

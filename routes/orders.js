const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const catalogDb = require('../catalogDb');
const { notifySellerWhatsApp } = require('../notify');
const { requireAdmin } = require('./admin');

const router = express.Router();

const STATUS_STEPS = [
  'Commande passée',
  'Paiement confirmé',
  'Préparation',
  'Expédition',
  'Livraison en cours',
  'Livraison terminée',
];

// Crée une commande "en attente de paiement" (statut 0).
// Le frontend appelle cette route juste avant de rediriger
// le client vers Wave ou Orange Money.
router.post('/', (req, res) => {
  const { items, total, address, phone, name, payment } = req.body || {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La commande ne contient aucun article.' });
  }
  if (!total || total <= 0) {
    return res.status(400).json({ error: 'Montant de commande invalide.' });
  }

  const order = {
    id: crypto.randomUUID(),
    name: name || '',
    phone: phone || '',
    address: address || '',
    items,
    total,
    payment: payment || 'Non spécifié',
    status: 0, // 0 = Commande passée / en attente de paiement
    paid: payment === 'Paiement à la livraison', // pas de paiement en ligne pour ce mode
    createdAt: new Date().toISOString(),
  };

  db.createOrder(order);

  // Décrémente le stock côté serveur pour que ça survive à un redémarrage
  // (les articles doivent inclure un "id" de produit pour être décomptés).
  const catalog = catalogDb.readCatalog();
  let changed = false;
  items.forEach(item => {
    if (item.id === undefined) return;
    const product = catalog.products.find(p => p.id === item.id);
    if (product) { product.stock = Math.max(0, product.stock - item.qty); changed = true; }
  });
  if (changed) catalogDb.writeCatalog(catalog);

  // Notification WhatsApp au vendeur (best-effort, ne bloque jamais la réponse).
  const itemsList = items.map(it => `${it.name} x${it.qty}`).join(', ');
  notifySellerWhatsApp(
    `🛍️ Nouvelle commande SHOPSN\nClient : ${order.name} (${order.phone})\nArticles : ${itemsList}\nTotal : ${order.total} FCFA\nPaiement : ${order.payment}\nRéférence : #${order.id.slice(0, 8)}`
  );

  res.json({ order });
});

// Infos du vendeur pour le paiement manuel (numéros Wave/Orange Money
// personnels), utilisées tant qu'il n'y a pas encore d'accès API.
router.get('/payment-info', (req, res) => {
  res.json({
    sellerName: process.env.SELLER_NAME || 'Le vendeur',
    waveNumber: process.env.SELLER_WAVE_NUMBER || null,
    orangeNumber: process.env.SELLER_ORANGE_NUMBER || null,
  });
});

// L'admin confirme qu'il a bien reçu le paiement manuel (Wave/OM envoyé
// directement à son numéro personnel), après l'avoir vérifié sur son téléphone.
router.post('/:id/confirm-payment', requireAdmin, (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
  const updated = db.updateOrder(order.id, { paid: true, status: Math.max(order.status, 1) });
  res.json({ order: updated });
});

// Exporte toutes les commandes en fichier CSV (ouvrable dans Excel).
// Placée AVANT /:id pour que "export.csv" ne soit pas interprété comme un id.
router.get('/export.csv', requireAdmin, (req, res) => {
  const orders = db.listOrders();
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ['Référence', 'Date', 'Client', 'Téléphone', 'Adresse', 'Articles', 'Total (FCFA)', 'Paiement', 'Payé', 'Statut'];
  const rows = orders.map(o => [
    o.id.slice(0, 8),
    new Date(o.createdAt).toLocaleString('fr-FR'),
    o.name,
    o.phone,
    o.address,
    o.items.map(it => `${it.name} x${it.qty}`).join(' | '),
    o.total,
    o.payment,
    o.paid ? 'Oui' : 'Non',
    STATUS_STEPS[o.status],
  ]);
  const csv = [header, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="commandes-shopsn.csv"');
  res.send('\uFEFF' + csv); // \uFEFF (BOM) pour un bon affichage des accents dans Excel
});

// Le client consulte SES propres commandes en indiquant son numéro de
// téléphone — jamais la liste complète, pour protéger les autres clients.
router.get('/mine', (req, res) => {
  const phone = (req.query.phone || '').replace(/\D/g, ''); // ne garde que les chiffres
  if (!phone || phone.length < 6) {
    return res.status(400).json({ error: 'Merci d\'indiquer un numéro de téléphone valide.' });
  }
  const orders = db.listOrders().filter(o => (o.phone || '').replace(/\D/g, '').endsWith(phone.slice(-8)));
  res.json({ orders, statusSteps: STATUS_STEPS });
});

// Le client peut annuler SA commande, en reconfirmant son numéro de
// téléphone (pour éviter qu'il annule la commande d'un autre client en
// devinant une référence). Uniquement possible tant qu'elle n'est pas
// encore payée — au-delà, le client doit contacter le vendeur directement.
router.delete('/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });

  const phone = (req.query.phone || req.body?.phone || '').replace(/\D/g, '');
  const orderPhone = (order.phone || '').replace(/\D/g, '');
  if (!phone || !orderPhone.endsWith(phone.slice(-8))) {
    return res.status(403).json({ error: 'Numéro de téléphone incorrect pour cette commande.' });
  }
  if (order.paid) {
    return res.status(400).json({ error: 'Cette commande est déjà payée, contactez le vendeur pour l\'annuler.' });
  }
  db.deleteOrder(order.id);
  res.json({ ok: true });
});

// Récupère une commande précise (utilisé par le frontend pour
// afficher le suivi et vérifier si le paiement est confirmé).
router.get('/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
  res.json({ order, statusLabel: STATUS_STEPS[order.status] });
});

// Liste toutes les commandes (réservé à l'admin — protégé par mot de passe).
router.get('/', requireAdmin, (req, res) => {
  res.json({ orders: db.listOrders(), statusSteps: STATUS_STEPS });
});

// Mise à jour manuelle du statut par l'admin (préparation, expédition, etc.)
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (typeof status !== 'number' || status < 0 || status >= STATUS_STEPS.length) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }
  const order = db.updateOrder(req.params.id, { status });
  if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
  res.json({ order });
});

module.exports = router;
module.exports.STATUS_STEPS = STATUS_STEPS;

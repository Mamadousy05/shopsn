// Webhook WhatsApp Cloud API — reçoit les accusés de réception de Meta
// (sent / delivered / read / failed) pour les messages qu'on a envoyés,
// et met à jour le statut de la commande correspondante.
//
// À configurer dans le tableau de bord Meta for Developers, sous
// WhatsApp > Configuration > Webhook. Voir le README pour les étapes
// détaillées d'obtention des identifiants.

const express = require('express');
const db = require('../db');

const router = express.Router();

// 1) Vérification du webhook par Meta (appelée une seule fois, quand vous
//    enregistrez l'URL du webhook dans le tableau de bord Meta).
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && expectedToken && token === expectedToken) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// 2) Réception des événements (accusés de réception de statut, et
//    éventuellement des messages entrants, qu'on ignore ici).
router.post('/', (req, res) => {
  try {
    const entries = req.body?.entry || [];
    entries.forEach(entry => {
      const changes = entry.changes || [];
      changes.forEach(change => {
        const statuses = change.value?.statuses || [];
        statuses.forEach(statusEvent => {
          const messageId = statusEvent.id;
          const status = statusEvent.status; // 'sent' | 'delivered' | 'read' | 'failed'
          if (!messageId || !status) return;

          const order = db.findOrderByWhatsAppMessageId(messageId);
          if (order) {
            db.updateOrder(order.id, { whatsappStatus: status });
            console.log(`Commande ${order.id.slice(0, 8)} — statut WhatsApp mis à jour : ${status}`);
          }
        });
      });
    });
  } catch (err) {
    console.error('Webhook WhatsApp — erreur de traitement :', err.message);
  }

  // Toujours répondre 200 rapidement, sinon Meta réessaiera inutilement.
  res.sendStatus(200);
});

module.exports = router;

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { notifySellerWhatsApp } = require('../notify');

const router = express.Router();

const WAVE_API_URL = 'https://api.wave.com/v1/checkout/sessions';

// ---------------------------------------------------------
// 1) Le frontend appelle POST /api/wave/checkout avec l'id
//    de la commande déjà créée via /api/orders.
//    On crée une "session de paiement" chez Wave, et on
//    renvoie au frontend l'URL vers laquelle rediriger le client.
// ---------------------------------------------------------
router.post('/checkout', async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const order = db.getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Commande introuvable.' });

    if (!process.env.WAVE_API_KEY || process.env.WAVE_API_KEY.startsWith('secret_remplacez')) {
      return res.status(500).json({
        error: "Clé API Wave non configurée. Ajoutez WAVE_API_KEY dans votre fichier .env (voir README).",
      });
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';

    const response = await fetch(WAVE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WAVE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(order.total),
        currency: 'XOF',
        // client_reference nous permet de retrouver la commande
        // quand Wave nous notifie du paiement via le webhook.
        client_reference: order.id,
        success_url: `${baseUrl}/success.html?order=${order.id}`,
        error_url: `${baseUrl}/cancel.html?order=${order.id}`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erreur Wave:', data);
      return res.status(502).json({ error: "Wave a refusé la création du paiement.", details: data });
    }

    res.json({ launchUrl: data.wave_launch_url, sessionId: data.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la création du paiement Wave.' });
  }
});

// ---------------------------------------------------------
// 2) Wave appelle cette route automatiquement pour confirmer
//    qu'un paiement a bien été effectué. C'est LA seule source
//    de vérité : on ne marque jamais une commande "payée" en
//    se basant uniquement sur le retour du navigateur du client.
//    Cette route doit être accessible en HTTPS publique (donc pas
//    en localhost) une fois configurée dans le dashboard Wave.
//    IMPORTANT : cette fonction est montée séparément dans server.js,
//    AVANT express.json(), car la vérification de signature a besoin
//    du corps brut (non transformé) de la requête.
// ---------------------------------------------------------
function handleWaveWebhook(req, res) {
  try {
    const signatureHeader = req.headers['wave-signature'];
    const secret = process.env.WAVE_WEBHOOK_SECRET;

    if (!secret || secret.startsWith('whsec_remplacez')) {
      console.warn('WAVE_WEBHOOK_SECRET non configuré : webhook ignoré par sécurité.');
      return res.status(500).send('Webhook secret not configured');
    }

    // Vérification de la signature HMAC-SHA256 envoyée par Wave,
    // pour être sûr que la requête vient bien de Wave et non d'un attaquant.
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('hex');

    if (signatureHeader !== expectedSignature) {
      console.warn('Signature Wave invalide, requête ignorée.');
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(req.body.toString('utf-8'));

    if (event.type === 'checkout.session.completed') {
      const orderId = event.data.client_reference;
      const order = db.getOrder(orderId);
      if (order) {
        db.updateOrder(orderId, { paid: true, status: Math.max(order.status, 1) });
        console.log(`Commande ${orderId} marquée comme payée via Wave.`);
        notifySellerWhatsApp(`✅ Paiement Wave reçu\nCommande #${orderId.slice(0, 8)}\nClient : ${order.name}\nMontant : ${order.total} FCFA`);
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Erreur traitement webhook Wave:', err);
    res.status(500).send('Webhook error');
  }
}

module.exports = router;
module.exports.handleWaveWebhook = handleWaveWebhook;

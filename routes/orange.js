const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { notifySellerWhatsApp } = require('../notify');

const router = express.Router();

let cachedToken = null;
let cachedTokenExpiry = 0;

// L'API Orange Money fonctionne avec OAuth2 : on échange notre
// client_id / client_secret contre un jeton d'accès temporaire.
async function getOrangeAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) {
    return cachedToken;
  }

  const basicAuth = Buffer.from(
    `${process.env.ORANGE_CLIENT_ID}:${process.env.ORANGE_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://api.orange.com/oauth/v3/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error('Impossible d\'obtenir un jeton Orange Money : ' + JSON.stringify(data));
  }

  cachedToken = data.access_token;
  // On retire une marge de 60s pour éviter d'utiliser un jeton expiré de justesse.
  cachedTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// ---------------------------------------------------------
// 1) Crée une demande de paiement Orange Money pour une commande,
//    puis renvoie au frontend l'URL vers laquelle rediriger le client.
// ---------------------------------------------------------
router.post('/checkout', async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const order = db.getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Commande introuvable.' });

    if (!process.env.ORANGE_CLIENT_ID || process.env.ORANGE_CLIENT_ID.startsWith('remplacez')) {
      return res.status(500).json({
        error: "Identifiants Orange Money non configurés. Renseignez ORANGE_CLIENT_ID, ORANGE_CLIENT_SECRET et ORANGE_MERCHANT_KEY dans .env (voir README).",
      });
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:4000';
    const country = process.env.ORANGE_COUNTRY || 'sn';
    const accessToken = await getOrangeAccessToken();

    const response = await fetch(
      `https://api.orange.com/orange-money-webpay/${country}/v1/webpayment`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          merchant_key: process.env.ORANGE_MERCHANT_KEY,
          currency: 'OUV', // code devise interne Orange pour le XOF (Sénégal)
          order_id: order.id,
          amount: order.total,
          return_url: `${baseUrl}/success.html?order=${order.id}`,
          cancel_url: `${baseUrl}/cancel.html?order=${order.id}`,
          notif_url: `${baseUrl}/api/orange/webhook`,
          lang: 'fr',
          reference: `SHOPSN-${order.id.slice(0, 8)}`,
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error('Erreur Orange Money:', data);
      return res.status(502).json({ error: 'Orange Money a refusé la création du paiement.', details: data });
    }

    // On garde le pay_token pour pouvoir vérifier le statut plus tard si besoin.
    db.updateOrder(order.id, { orangePayToken: data.pay_token });

    res.json({ paymentUrl: data.payment_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la création du paiement Orange Money.' });
  }
});

// ---------------------------------------------------------
// 2) Orange Money notifie ce webhook une fois le paiement terminé.
//    Comme l'API Orange ne signe pas ses notifications aussi
//    strictement que Wave, on revérifie le statut en interrogeant
//    nous-mêmes l'API Orange avant de valider la commande.
// ---------------------------------------------------------
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const { order_id, status } = req.body || {};
    if (!order_id) return res.status(400).send('order_id manquant');

    const order = db.getOrder(order_id);
    if (!order) return res.status(404).send('Commande introuvable');

    if (status === 'SUCCESS' && order.orangePayToken) {
      // Double vérification auprès d'Orange avant de valider,
      // pour ne jamais faire confiance uniquement à la notification reçue.
      const accessToken = await getOrangeAccessToken();
      const country = process.env.ORANGE_COUNTRY || 'sn';
      const verifyResp = await fetch(
        `https://api.orange.com/orange-money-webpay/${country}/v1/transactionstatus`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            order_id: order.id,
            amount: order.total,
            pay_token: order.orangePayToken,
          }),
        }
      );
      const verifyData = await verifyResp.json();

      if (verifyData.status === 'SUCCESS') {
        db.updateOrder(order.id, { paid: true, status: Math.max(order.status, 1) });
        console.log(`Commande ${order.id} marquée comme payée via Orange Money.`);
        notifySellerWhatsApp(`✅ Paiement Orange Money reçu\nCommande #${order.id.slice(0, 8)}\nClient : ${order.name}\nMontant : ${order.total} FCFA`);
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Erreur traitement webhook Orange Money:', err);
    res.status(500).send('Webhook error');
  }
});

module.exports = router;

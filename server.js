require('dotenv').config();
const express = require('express');
const path = require('path');

const ordersRouter = require('./routes/orders');
const waveRouter = require('./routes/wave');
const orangeRouter = require('./routes/orange');
const adminRouter = require('./routes/admin');
const catalogRouter = require('./routes/catalog');
const whatsappWebhookRouter = require('./routes/whatsapp-webhook');

const app = express();

const waveWebhookHandler = require('./routes/wave').handleWaveWebhook;

// Le webhook Wave a besoin du corps BRUT (non transformé) de la
// requête pour vérifier la signature de sécurité. Cette route est
// donc montée AVANT express.json(), avec son propre parsing "raw".
app.post('/api/wave/webhook', express.raw({ type: '*/*' }), waveWebhookHandler);

// Toutes les autres routes reçoivent normalement du JSON. La limite est
// augmentée à 10mb car les images de produits (converties en base64) sont
// envoyées dans le corps de la requête.
app.use(express.json({ limit: '10mb' }));
app.use('/api/orders', ordersRouter);
app.use('/api/wave', waveRouter);
app.use('/api/orange', orangeRouter);
app.use('/api/admin', adminRouter);
app.use('/api/catalog', catalogRouter);
app.use('/webhook/whatsapp', whatsappWebhookRouter);

// Sert le site (shopsn.html, success.html, cancel.html, etc.)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shopsn.html'));
});

// Adresse directe pour l'admin (ex: tonsite.com/admin) — sert le même
// site, mais celui-ci détecte l'URL et ouvre directement la demande de
// mot de passe (voir la fin de shopsn.html).
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'shopsn.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Serveur SHOPSN démarré : http://localhost:${PORT}`);
  const pwd = process.env.ADMIN_PASSWORD || 'admin123 (par défaut — pensez à le changer dans .env)';
  console.log(`   Espace admin accessible depuis le site (mot de passe : ${pwd})`);
});

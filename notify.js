// Envoie une notification WhatsApp automatique au vendeur à chaque
// commande. Deux méthodes possibles (voir .env.example) :
//   1. Green API — prioritaire si configurée, plus fiable (service payant,
//      offre gratuite pour démarrer). https://green-api.com
//   2. CallMeBot — repli gratuit si Green API n'est pas configurée, mais
//      moins fiable (service gratuit tenu par un développeur indépendant).
// Ces fonctions ne bloquent jamais la création de commande : en cas
// d'échec, on se contente de logguer côté serveur.

async function notifyViaGreenAPI(message) {
  const idInstance = process.env.GREENAPI_ID_INSTANCE;
  const apiToken = process.env.GREENAPI_API_TOKEN;
  const apiUrl = process.env.GREENAPI_URL || 'https://api.green-api.com';
  const phone = process.env.SELLER_WHATSAPP_NUMBER;

  if (!idInstance || !apiToken || !phone) return false; // pas configurée

  try {
    const url = `${apiUrl}/waInstance${idInstance}/sendMessage/${apiToken}`;
    const chatId = phone.replace(/\D/g, '') + '@c.us';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
    });
    if (!response.ok) {
      console.warn('Green API: notification WhatsApp non envoyée (statut ' + response.status + ').');
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Green API: erreur lors de l\'envoi de la notification WhatsApp —', err.message);
    return false;
  }
}

async function notifyViaCallMeBot(message) {
  const phone = process.env.CALLMEBOT_PHONE;
  const apikey = process.env.CALLMEBOT_APIKEY;

  if (!phone || !apikey) return false; // pas configurée

  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apikey)}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('CallMeBot: notification WhatsApp non envoyée (statut ' + response.status + ').');
      return false;
    }
    return true;
  } catch (err) {
    console.warn('CallMeBot: erreur lors de l\'envoi de la notification WhatsApp —', err.message);
    return false;
  }
}

async function notifySellerWhatsApp(message) {
  const sentViaGreenAPI = await notifyViaGreenAPI(message);
  if (sentViaGreenAPI) return;
  await notifyViaCallMeBot(message);
}

// ===========================================================================
// WhatsApp Business Platform / Cloud API (officiel Meta)
// ===========================================================================
// Contrairement à notifySellerWhatsApp() ci-dessus (des ponts non-officiels),
// ceci utilise l'API officielle de Meta. Ça nécessite un compte Meta Business
// + une app WhatsApp configurée (voir le README pour les étapes complètes).
// Avantage : fiable et pris en charge par Meta. Contrainte : en dehors d'une
// fenêtre de 24h suivant un message du client, Meta impose l'utilisation
// d'un "template" pré-approuvé pour les messages initiés par l'entreprise.

function buildOrderMessageText(order) {
  const created = new Date(order.createdAt);
  const dateStr = created.toLocaleDateString('fr-FR');
  const heureStr = created.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const subtotal = order.items.reduce((s, it) => s + it.price * it.qty, 0);
  const livraison = order.total - subtotal;

  const lignesProduits = order.items
    .map(it => `• ${it.name} × ${it.qty}\n  Prix : ${it.price.toLocaleString('fr-FR')} FCFA\n  Sous-total : ${(it.price * it.qty).toLocaleString('fr-FR')} FCFA`)
    .join('\n\n');

  return `🛒 NOUVELLE COMMANDE SHOPSN\n\n`
    + `🆔 Commande : #${order.id.slice(0, 8)}\n\n`
    + `👤 CLIENT\n`
    + `Nom : ${order.name}\n`
    + `Téléphone : ${order.phone}\n\n`
    + `📍 LIVRAISON\n`
    + `Adresse : ${order.address}\n\n`
    + `📦 PRODUITS\n\n${lignesProduits}\n\n`
    + `💰 RÉCAPITULATIF\n\n`
    + `Sous-total : ${subtotal.toLocaleString('fr-FR')} FCFA\n`
    + `Livraison : ${livraison.toLocaleString('fr-FR')} FCFA\n`
    + `TOTAL : ${order.total.toLocaleString('fr-FR')} FCFA\n\n`
    + `💳 Paiement : ${order.payment}\n\n`
    + `📅 Date : ${dateStr}\n`
    + `🕐 Heure : ${heureStr}\n\n`
    + `🟡 NOUVELLE COMMANDE`;
}

// Envoie la notification via l'API officielle. Retourne
// { ok: true, messageId } en cas de succès, { ok: false, error } sinon.
// Ne lève jamais d'exception : la commande doit rester enregistrée même
// si WhatsApp échoue (voir routes/orders.js).
async function sendWhatsAppOrderNotification(order) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
  const sellerNumber = process.env.WHATSAPP_SELLER_NUMBER;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;

  if (!token || !phoneNumberId || !sellerNumber) {
    return { ok: false, error: 'WhatsApp Cloud API non configurée (variables manquantes dans .env).' };
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  // Deux formats possibles : message texte libre (fonctionne pour tester
  // avec un numéro vérifié, ou dans les 24h suivant un message du client),
  // ou template pré-approuvé (obligatoire en production pour initier une
  // conversation). On utilise le template seulement s'il est configuré.
  const body = templateName
    ? {
        messaging_product: 'whatsapp',
        to: sellerNumber,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'fr' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: '#' + order.id.slice(0, 8) },
                { type: 'text', text: order.name },
                { type: 'text', text: order.phone },
                { type: 'text', text: order.total.toLocaleString('fr-FR') + ' FCFA' },
                { type: 'text', text: order.address },
                { type: 'text', text: new Date(order.createdAt).toLocaleDateString('fr-FR') },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to: sellerNumber,
        type: 'text',
        text: { body: buildOrderMessageText(order) },
      };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s max
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      // Ne jamais logguer le token — seulement le message d'erreur retourné par Meta.
      console.error('WhatsApp Cloud API — échec de l\'envoi :', data.error?.message || response.status);
      return { ok: false, error: data.error?.message || 'Erreur WhatsApp Cloud API.' };
    }

    const messageId = data.messages?.[0]?.id || null;
    return { ok: true, messageId };
  } catch (err) {
    console.error('WhatsApp Cloud API — erreur réseau :', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { notifySellerWhatsApp, sendWhatsAppOrderNotification };

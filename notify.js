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

module.exports = { notifySellerWhatsApp };

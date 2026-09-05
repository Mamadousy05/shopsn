// Envoie une notification WhatsApp au vendeur via CallMeBot (service
// gratuit, un seul destinataire : le vendeur lui-même). Voir .env.example
// pour les instructions d'activation. Cette fonction ne bloque jamais la
// création de commande : si elle échoue, on se contente de logguer.

async function notifySellerWhatsApp(message) {
  const phone = process.env.CALLMEBOT_PHONE;
  const apikey = process.env.CALLMEBOT_APIKEY;

  if (!phone || !apikey) return; // notification non configurée, on ignore silencieusement

  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apikey)}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('CallMeBot: notification WhatsApp non envoyée (statut ' + response.status + ').');
    }
  } catch (err) {
    console.warn('CallMeBot: erreur lors de l\'envoi de la notification WhatsApp —', err.message);
  }
}

module.exports = { notifySellerWhatsApp };

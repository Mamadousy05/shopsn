# SHOPSN — Backend avec paiements Wave & Orange Money

Ce dossier contient un serveur Node.js qui permet à ton site SHOPSN d'accepter
des paiements Wave et Orange Money — soit **automatiquement** (avec un compte
marchand + NINEA), soit **manuellement** dès aujourd'hui, sans papiers, en
utilisant simplement les numéros Wave/Orange Money personnels du vendeur.

## 0. Pas encore de NINEA ? Commence ici (recommandé pour démarrer vite)

Si le vendeur n'a pas encore d'entreprise enregistrée, ouvre le fichier `.env`
et renseigne juste ces trois lignes avec ses vraies infos :

```
SELLER_NAME=Nom du vendeur
SELLER_WAVE_NUMBER=77 123 45 67
SELLER_ORANGE_NUMBER=77 123 45 67
```

C'est tout ! Dès qu'un client choisit "Wave" ou "Orange Money" au paiement, le
site affiche automatiquement ces numéros et le montant exact à envoyer. Une
fois que le vendeur voit l'argent arriver sur son téléphone, il ouvre l'espace
admin (mot de passe `admin123`) → onglet **Commandes** → bouton **"J'ai reçu
le paiement"** pour valider la commande.

C'est la méthode utilisée par la majorité des petits vendeurs sénégalais en
ligne. Elle demande un peu de vigilance de la part du vendeur (bien vérifier
le montant et l'heure du virement reçu avant de valider), mais elle marche
dès aujourd'hui, sans délai d'attente ni document à fournir.

## 1. Installer et lancer le projet

Il te faut [Node.js](https://nodejs.org) version 18 ou plus, installé sur ton
ordinateur ou ton serveur.

```bash
cd shopsn-backend
npm install
cp .env.example .env
npm start
```

Le site est alors accessible sur **http://localhost:4000**.

## 2. Passer au paiement 100% automatique plus tard (optionnel)

Le jour où le vendeur crée une entreprise (NINEA) et souhaite que les
paiements soient validés automatiquement sans vérification manuelle, voici
comment obtenir les accès API.

### Wave Business

1. Crée un compte sur [business.wave.com](https://business.wave.com) (ou
   l'application Wave Business) avec ton numéro et les documents de ton
   activité (CNI + NINEA).
2. Une fois le compte marchand validé par Wave (48 à 72h en général), va dans
   **Développeurs > Clés API** :
   - Copie ta **clé API** → colle-la dans `WAVE_API_KEY` du fichier `.env`.
   - Crée un **webhook** pointant vers `https://TON-DOMAINE/api/wave/webhook`
     (voir étape 4 pour l'hébergement) → copie le **secret du webhook** →
     colle-le dans `WAVE_WEBHOOK_SECRET`.

### Orange Money (Orange Developer)

1. Crée un compte sur [developer.orange.com](https://developer.orange.com).
2. Crée une nouvelle application et souscris à l'API **"Orange Money Web
   Payment"** (disponible pour le Sénégal).
3. Tu obtiens un **Client ID** et un **Client Secret** → à mettre dans
   `ORANGE_CLIENT_ID` et `ORANGE_CLIENT_SECRET`.
4. Pour accepter de vrais paiements (pas juste des tests), il faut en plus
   qu'Orange valide ton compte marchand Orange Money : ils te fourniront
   alors une **Merchant Key** → à mettre dans `ORANGE_MERCHANT_KEY`.
5. Renseigne `ORANGE_NOTIF_URL` (webhook) vers
   `https://TON-DOMAINE/api/orange/webhook`.

⚠️ Ce processus de validation marchande (Wave comme Orange) prend en général
quelques jours ouvrés et peut demander un numéro NINEA / un registre de
commerce selon ton statut.

## 3. Mettre le site en ligne (nécessaire uniquement pour le mode automatique)

Wave et Orange Money doivent pouvoir appeler ton serveur pour confirmer les
paiements (`webhook`). Cela veut dire que **localhost ne suffit pas** : il te
faut une adresse accessible sur internet, en HTTPS.

Deux options simples et gratuites/pas chères pour un projet étudiant :

- **Pour tester rapidement sans déployer** : installe
  [ngrok](https://ngrok.com), lance `ngrok http 4000`, il te donne une URL
  `https://xxxx.ngrok.app` à utiliser temporairement comme
  `PUBLIC_BASE_URL` et pour tes webhooks Wave/Orange.
- **Pour une mise en ligne durable** : héberge ce dossier sur un service comme
  [Render](https://render.com), [Railway](https://railway.app) ou une VPS, et
  utilise le nom de domaine fourni comme `PUBLIC_BASE_URL`.

Une fois en ligne, mets à jour `PUBLIC_BASE_URL` dans `.env` avec ta vraie
adresse, et redémarre le serveur.

## 4. Comment ça marche, concrètement

**Mode manuel (par défaut, sans NINEA) :**
1. Le client choisit "Wave" ou "Orange Money" et confirme sa commande.
2. Le site tente automatiquement le paiement via l'API — comme elle n'est pas
   configurée, il bascule sur l'affichage des numéros personnels du vendeur
   et du montant exact à envoyer.
3. Le client envoie l'argent via son application Wave/Orange Money, puis
   clique sur "J'ai envoyé le paiement".
4. Le vendeur vérifie sur son téléphone que l'argent est bien arrivé, puis
   clique sur "J'ai reçu le paiement" dans l'espace admin pour valider la
   commande.

**Mode automatique (une fois les clés API configurées) :**
1. Le client remplit son adresse et choisit "Wave" ou "Orange Money" au
   moment de payer.
2. Le site crée d'abord la commande côté serveur (`POST /api/orders`), avec
   le statut "en attente de paiement".
3. Le site appelle `POST /api/wave/checkout` ou `POST /api/orange/checkout`,
   qui renvoie un lien de paiement officiel.
4. Le client est redirigé vers l'application/le site Wave ou Orange Money
   pour taper son code secret et confirmer.
5. Une fois le paiement effectué, Wave/Orange Money notifie automatiquement
   ton serveur (le "webhook"). C'est cette notification — jamais le simple
   retour du navigateur — qui marque la commande comme réellement payée.
6. Le client revient sur `success.html`, et sa commande apparaît payée dans
   "Mes commandes" et dans l'espace admin.

## 5. Nouveautés : sécurité, catalogue durable, export

- **Mot de passe admin personnalisable** : change `ADMIN_PASSWORD` dans `.env`
  pour ne plus utiliser `admin123`. Le mot de passe n'est plus jamais visible
  dans le code du site — il reste sur le serveur.
- **Produits et catégories sauvegardés** : ils sont maintenant stockés dans
  `data/catalog.json`, comme les commandes. Un redémarrage du serveur ne fait
  plus perdre les produits ajoutés par l'admin.
- **Stock décompté automatiquement côté serveur** : à chaque commande, le
  stock diminue dans `data/catalog.json`, pas seulement dans le navigateur du
  client — donc ça reste correct même après un redémarrage.
- **Export CSV des commandes** : bouton "⬇️ Télécharger en CSV (Excel)" dans
  l'onglet Commandes de l'espace admin, pratique pour la compta.
- **Notification WhatsApp à chaque commande** : optionnel, via le service
  gratuit CallMeBot. Voir les instructions dans `.env.example` (variables
  `CALLMEBOT_PHONE` et `CALLMEBOT_APIKEY`). Une fois configuré, le vendeur
  reçoit un message WhatsApp automatique sur son propre téléphone à chaque
  nouvelle commande, et à chaque confirmation de paiement Wave/Orange Money
  automatique. C'est un service gratuit pour un usage personnel (un seul
  destinataire), donc parfois un peu moins fiable qu'une solution payante,
  mais suffisant pour être averti rapidement.

## 6. Limitations actuelles (à savoir)

- Le mode manuel demande de la rigueur : vérifie toujours le montant exact et
  l'heure du paiement reçu avant de cliquer sur "J'ai reçu le paiement", pour
  éviter de valider une commande par erreur.

- Le paiement par **carte bancaire** n'est pas branché : il faudrait un
  prestataire supplémentaire (ex. PayDunya, CinetPay) qui agrège plusieurs
  moyens de paiement. Dis-le-moi si tu veux que je l'ajoute.
- Les produits, catégories et stocks restent gérés en mémoire côté site
  (comme avant) et ne sont pas encore sauvegardés sur le serveur — seules les
  commandes et les paiements passent maintenant par le backend.
- Le stockage des commandes se fait dans un simple fichier
  `data/orders.json`. Cela suffit pour un projet étudiant ; pour une vraie
  boutique en production, il faudrait migrer vers une base de données.

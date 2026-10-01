// Conservation durable des données (commandes et catalogue).
//
// - Si MONGODB_URI est renseigné (par exemple une base gratuite MongoDB
//   Atlas), les données sont enregistrées dans MongoDB : elles survivent aux
//   redémarrages et aux mises à jour du site, même sur l'offre gratuite de Render.
// - Sinon, on garde les fichiers du dossier "data" (pratique en local).
//
// Les données sont chargées en mémoire au démarrage : le reste du site les lit
// sans attendre, et chaque modification est ensuite recopiée dans MongoDB.
// Chaque commande et chaque produit est un document séparé, car MongoDB
// limite la taille d'un document (16 Mo) et les photos des produits pèsent lourd.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

let mongoClient = null;
let mongoDb = null;
const cache = {};      // nom de liste -> tableau en mémoire
const saved = {};      // nom de liste -> Map(clé -> JSON déjà enregistré)
let writeQueue = Promise.resolve();

// Description des listes conservées : collection MongoDB, champ servant de
// clé, ordre de tri au chargement, et fichier utilisé sans MongoDB.
const LISTS = {
  orders: { collection: 'orders', key: 'id', sort: { createdAt: -1 } },
  products: { collection: 'products', key: 'id', sort: { id: 1 } },
};
const META_COLLECTION = 'meta';

function isMongoEnabled() {
  return Boolean(mongoDb);
}

function readJsonFile(name, fallback) {
  const file = path.join(DATA_DIR, name);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    console.warn(`Fichier ${name} illisible, ignoré.`);
  }
  return fallback;
}

function writeJsonFile(name, value) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(value, null, 2), 'utf-8');
}

// Ajoute une écriture à la file d'attente : les écritures partent dans
// l'ordre, une par une, pour ne jamais en perdre ni les mélanger.
function enqueue(task) {
  writeQueue = writeQueue.then(task).catch(err => {
    console.error('⚠️  Échec de l\'enregistrement dans MongoDB :', err.message);
  });
  return writeQueue;
}

function stripMongoId(doc) {
  const { _id, ...rest } = doc;
  return rest;
}

// À appeler une fois au démarrage, avant d'accepter des visiteurs.
async function init() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('   Données : fichiers du dossier "data" (MONGODB_URI non renseigné).');
    return;
  }
  const { MongoClient } = require('mongodb');
  mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await mongoClient.connect();
  mongoDb = mongoClient.db(process.env.MONGODB_DB || 'shopsn');

  for (const [name, def] of Object.entries(LISTS)) {
    const docs = await mongoDb.collection(def.collection).find({}).sort(def.sort).toArray();
    cache[name] = docs.map(stripMongoId);
    saved[name] = new Map(cache[name].map(item => [String(item[def.key]), JSON.stringify(item)]));
  }
  const metaDocs = await mongoDb.collection(META_COLLECTION).find({}).toArray();
  cache.meta = Object.fromEntries(metaDocs.map(d => [d._id, d.value]));

  // Première connexion à une base vide : on y recopie les commandes déjà
  // présentes dans les fichiers locaux, s'il y en a.
  if (cache.orders.length === 0) {
    const localOrders = readJsonFile('orders.json', []);
    if (Array.isArray(localOrders) && localOrders.length) saveList('orders', 'orders.json', localOrders);
  }
  console.log(`   Données : MongoDB (${cache.orders.length} commandes, ${cache.products.length} produits).`);
}

// --- Listes (commandes, produits) ---

function getList(name, fileName) {
  if (!isMongoEnabled()) return readJsonFile(fileName, null);
  return cache[name].map(item => ({ ...item }));
}

function saveList(name, fileName, items) {
  if (!isMongoEnabled()) return writeJsonFile(fileName, items);
  const def = LISTS[name];
  cache[name] = items.map(item => ({ ...item }));

  // On n'envoie à MongoDB que ce qui a changé depuis le dernier enregistrement.
  const before = saved[name];
  const after = new Map(items.map(item => [String(item[def.key]), JSON.stringify(item)]));
  const ops = [];
  for (const [key, json] of after) {
    if (before.get(key) !== json) {
      ops.push({ replaceOne: { filter: { _id: key }, replacement: { _id: key, ...JSON.parse(json) }, upsert: true } });
    }
  }
  for (const key of before.keys()) {
    if (!after.has(key)) ops.push({ deleteOne: { filter: { _id: key } } });
  }
  saved[name] = after;
  if (ops.length) enqueue(() => mongoDb.collection(def.collection).bulkWrite(ops, { ordered: true }));
}

// --- Petites valeurs (catégories, prochain numéro de produit) ---

function getMeta(key) {
  return isMongoEnabled() ? cache.meta[key] : undefined;
}

function setMeta(key, value) {
  if (!isMongoEnabled()) return;
  if (JSON.stringify(cache.meta[key]) === JSON.stringify(value)) return;
  cache.meta[key] = value;
  enqueue(() => mongoDb.collection(META_COLLECTION).replaceOne({ _id: key }, { _id: key, value }, { upsert: true }));
}

// Attend que toutes les écritures en cours soient parties (utile à l'arrêt).
function flush() {
  return writeQueue;
}

module.exports = { init, isMongoEnabled, getList, saveList, getMeta, setMeta, flush, readJsonFile };

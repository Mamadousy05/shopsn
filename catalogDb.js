// Stockage du catalogue (produits + catégories) dans un fichier JSON,
// comme pour les commandes. Ça permet aux produits ajoutés par l'admin
// de survivre à un redémarrage du serveur.

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'catalog.json');

// Le dossier "data" n'est pas envoyé sur GitHub (il est dans .gitignore),
// donc il n'existe pas forcément sur un serveur fraîchement déployé.
// On le crée nous-mêmes au besoin, pour éviter une erreur au premier lancement.
function ensureDataDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const SEED = {
  categories: [
    { id: 'mode', name: 'Mode & Vêtements', icon: '👗' },
    { id: 'electro', name: 'Électronique', icon: '🔌' },
    { id: 'telephonie', name: 'Téléphonie', icon: '📱' },
    { id: 'maison', name: 'Maison & Cuisine', icon: '🍲' },
    { id: 'beaute', name: 'Beauté & Soins', icon: '💄' },
    { id: 'alimentation', name: 'Alimentation', icon: '🌾' },
  ],
  products: [
    { id: 1, name: 'Robe wax imprimée', cat: 'mode', price: 15000, stock: 8, icon: '👗', image: null, desc: "Robe en tissu wax authentique, coupe ajustée, idéale pour les grandes occasions." },
    { id: 2, name: 'Boubou homme brodé', cat: 'mode', price: 25000, stock: 5, icon: '🥻', image: null, desc: "Boubou traditionnel brodé, tissu bazin riche, plusieurs tailles disponibles." },
    { id: 3, name: 'Casque audio Bluetooth', cat: 'electro', price: 12000, stock: 15, icon: '🎧', image: null, desc: "Casque sans fil, autonomie 20 heures." },
    { id: 4, name: 'Enceinte portable', cat: 'electro', price: 18000, stock: 10, icon: '🔊', image: null, desc: "Enceinte Bluetooth résistante aux éclaboussures." },
    { id: 5, name: 'Smartphone Android 128Go', cat: 'telephonie', price: 95000, stock: 6, icon: '📱', image: null, desc: "Double SIM, 128 Go, écran 6.5 pouces." },
    { id: 6, name: 'Chargeur rapide Type-C', cat: 'telephonie', price: 4000, stock: 30, icon: '🔌', image: null, desc: "Chargeur rapide 25W." },
    { id: 7, name: 'Marmite en aluminium', cat: 'maison', price: 9000, stock: 12, icon: '🍲', image: null, desc: "Marmite 30cm, idéale pour les plats mijotés." },
    { id: 8, name: 'Service à thé traditionnel', cat: 'maison', price: 13500, stock: 7, icon: '🫖', image: null, desc: "Théière, verres et plateau assorti." },
    { id: 9, name: 'Beurre de karité pur', cat: 'beaute', price: 3000, stock: 40, icon: '🧴', image: null, desc: "Beurre de karité 100% naturel, non raffiné." },
    { id: 10, name: 'Huile de coco bio', cat: 'beaute', price: 3500, stock: 25, icon: '🥥', image: null, desc: "Huile de coco pressée à froid, multi-usage." },
    { id: 11, name: 'Sac de riz brisé 5kg', cat: 'alimentation', price: 4500, stock: 50, icon: '🌾', image: null, desc: "Riz brisé, sac de 5kg." },
    { id: 12, name: 'Café Touba moulu', cat: 'alimentation', price: 2000, stock: 60, icon: '☕', image: null, desc: "Café Touba traditionnel, paquet de 250g." },
  ],
  nextProductId: 13,
};

function readCatalog() {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(SEED, null, 2), 'utf-8');
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (e) {
    return SEED;
  }
}

function writeCatalog(catalog) {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(catalog, null, 2), 'utf-8');
}

module.exports = { readCatalog, writeCatalog };

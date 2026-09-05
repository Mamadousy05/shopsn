const express = require('express');
const catalogDb = require('../catalogDb');
const { requireAdmin } = require('./admin');

const router = express.Router();

// Récupère tout le catalogue (produits + catégories).
router.get('/', (req, res) => {
  const catalog = catalogDb.readCatalog();
  res.json({ products: catalog.products, categories: catalog.categories });
});

// ---------------------------------------------------------
// Produits
// ---------------------------------------------------------
router.post('/products', requireAdmin, (req, res) => {
  const { name, cat, price, stock, image, images, icon, desc } = req.body || {};
  if (!name || !cat || !price || stock === undefined) {
    return res.status(400).json({ error: 'Champs manquants (nom, catégorie, prix, stock).' });
  }
  const catalog = catalogDb.readCatalog();
  const category = catalog.categories.find(c => c.id === cat);
  const product = {
    id: catalog.nextProductId++,
    name, cat, price: Number(price), stock: Number(stock),
    icon: icon || (category ? category.icon : '🏷️'),
    image: image || null,
    images: Array.isArray(images) ? images.slice(0, 3) : [],
    desc: desc || "Nouveau produit ajouté par l'administrateur.",
  };
  catalog.products.push(product);
  catalogDb.writeCatalog(catalog);
  res.json({ product });
});

router.put('/products/:id', requireAdmin, (req, res) => {
  const catalog = catalogDb.readCatalog();
  const id = Number(req.params.id);
  const product = catalog.products.find(p => p.id === id);
  if (!product) return res.status(404).json({ error: 'Produit introuvable.' });

  const { name, cat, price, stock, image, images } = req.body || {};
  if (name !== undefined) product.name = name;
  if (cat !== undefined) {
    product.cat = cat;
    const category = catalog.categories.find(c => c.id === cat);
    if (!image && category) product.icon = category.icon;
  }
  if (price !== undefined) product.price = Number(price);
  if (stock !== undefined) product.stock = Number(stock);
  if (image !== undefined) product.image = image;
  if (images !== undefined) product.images = Array.isArray(images) ? images.slice(0, 3) : [];

  catalogDb.writeCatalog(catalog);
  res.json({ product });
});

router.delete('/products/:id', requireAdmin, (req, res) => {
  const catalog = catalogDb.readCatalog();
  const id = Number(req.params.id);
  catalog.products = catalog.products.filter(p => p.id !== id);
  catalogDb.writeCatalog(catalog);
  res.json({ ok: true });
});

// ---------------------------------------------------------
// Catégories
// ---------------------------------------------------------
router.post('/categories', requireAdmin, (req, res) => {
  const { name, icon } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nom de catégorie manquant.' });
  const catalog = catalogDb.readCatalog();
  const id = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
  if (catalog.categories.some(c => c.id === id)) {
    return res.status(400).json({ error: 'Cette catégorie existe déjà.' });
  }
  const category = { id, name, icon: icon || '🏷️' };
  catalog.categories.push(category);
  catalogDb.writeCatalog(catalog);
  res.json({ category });
});

router.delete('/categories/:id', requireAdmin, (req, res) => {
  const catalog = catalogDb.readCatalog();
  const id = req.params.id;
  if (catalog.products.some(p => p.cat === id)) {
    return res.status(400).json({ error: 'Impossible : des produits utilisent encore cette catégorie.' });
  }
  catalog.categories = catalog.categories.filter(c => c.id !== id);
  catalogDb.writeCatalog(catalog);
  res.json({ ok: true });
});

// ---------------------------------------------------------
// Décrémente le stock de plusieurs produits d'un coup (appelé
// automatiquement à la création d'une commande).
// ---------------------------------------------------------
router.post('/decrement-stock', requireAdmin, (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Liste d\'articles manquante.' });
  const catalog = catalogDb.readCatalog();
  items.forEach(item => {
    const product = catalog.products.find(p => p.id === item.id);
    if (product) product.stock = Math.max(0, product.stock - item.qty);
  });
  catalogDb.writeCatalog(catalog);
  res.json({ ok: true });
});

module.exports = router;

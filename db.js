// Stockage des commandes : dans MongoDB si MONGODB_URI est renseigné
// (voir store.js), sinon dans le fichier data/orders.json.

const fs = require('fs');
const path = require('path');
const store = require('./store');

const DB_FILE = path.join(__dirname, 'data', 'orders.json');

function ensureDataDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readAll() {
  if (store.isMongoEnabled()) return store.getList('orders', 'orders.json');
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, '[]', 'utf-8');
  }
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  try {
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

function writeAll(orders) {
  if (store.isMongoEnabled()) return store.saveList('orders', 'orders.json', orders);
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(orders, null, 2), 'utf-8');
}

function createOrder(order) {
  const orders = readAll();
  orders.unshift(order);
  writeAll(orders);
  return order;
}

function getOrder(id) {
  return readAll().find(o => o.id === id) || null;
}

function listOrders() {
  return readAll();
}

function updateOrder(id, patch) {
  const orders = readAll();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...patch };
  writeAll(orders);
  return orders[idx];
}

function deleteOrder(id) {
  const orders = readAll();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return false;
  orders.splice(idx, 1);
  writeAll(orders);
  return true;
}

// Utilisé par le webhook WhatsApp pour retrouver quelle commande correspond
// à un accusé de réception (sent/delivered/read/failed).
function findOrderByWhatsAppMessageId(messageId) {
  return readAll().find(o => o.whatsappMessageId === messageId) || null;
}

module.exports = { createOrder, getOrder, listOrders, updateOrder, deleteOrder, findOrderByWhatsAppMessageId };

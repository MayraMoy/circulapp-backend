// scripts/migrate.js
const mongoose = require('mongoose');
require('dotenv').config();

async function runMigrations() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/circulapp');
    console.log('Conectado a MongoDB');

    // Crear índices
    const db = mongoose.connection.db;
    
    // Índices para usuarios
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ "location.coordinates": "2dsphere" });
    
    // Índices para productos
    await db.collection('products').createIndex({ "location.coordinates": "2dsphere" });
    await db.collection('products').createIndex({ category: 1, status: 1 });
    await db.collection('products').createIndex({ owner: 1 });
    await db.collection('products').createIndex({ createdAt: -1 });
    await db.collection('products').createIndex({ title: "text", description: "text" });
    
    // Índices para transacciones
    await db.collection('transactions').createIndex({ donor: 1 });
    await db.collection('transactions').createIndex({ recipient: 1 });
    await db.collection('transactions').createIndex({ status: 1 });
    
    // Índices para chats
    await db.collection('chats').createIndex({ participants: 1 });
    await db.collection('chats').createIndex({ product: 1 });
    
    // Índices para reseñas
    await db.collection('reviews').createIndex({ transaction: 1, reviewer: 1 }, { unique: true });
    await db.collection('reviews').createIndex({ reviewee: 1 });
    
    console.log('✅ Migraciones completadas exitosamente');
  } catch (error) {
    console.error('❌ Error en migraciones:', error);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
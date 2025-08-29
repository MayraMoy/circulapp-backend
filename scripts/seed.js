// scripts/seed.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Product = require('../models/Product');
require('dotenv').config();

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/circulapp');
    console.log('Conectado a MongoDB');

    // Limpiar base de datos
    await User.deleteMany({});
    await Product.deleteMany({});
    console.log('Base de datos limpiada');

    // Crear usuario administrador (Comuna)
    const adminPassword = await bcrypt.hash('admin123', 12);
    const admin = new User({
      name: 'Comuna Charbonier',
      email: 'admin@charbonier.gob.ar',
      password: adminPassword,
      userType: 'comuna',
      location: {
        address: 'Plaza Central, Charbonier, Córdoba',
        coordinates: { lat: -31.4201, lng: -64.1888 },
        city: 'Charbonier',
        province: 'Córdoba'
      },
      isVerified: true
    });
    await admin.save();

    // Crear usuarios de ejemplo
    const users = [
      {
        name: 'María González',
        email: 'maria@example.com',
        password: await bcrypt.hash('password123', 12),
        userType: 'individual',
        phone: '+54 351 123-4567',
        location: {
          address: 'Calle Principal 123, Charbonier',
          coordinates: { lat: -31.4205, lng: -64.1890 },
          city: 'Charbonier',
          province: 'Córdoba'
        }
      },
      {
        name: 'Juan Pérez',
        email: 'juan@example.com',
        password: await bcrypt.hash('password123', 12),
        userType: 'individual',
        phone: '+54 351 987-6543',
        location: {
          address: 'Av. San Martín 456, Charbonier',
          coordinates: { lat: -31.4210, lng: -64.1885 },
          city: 'Charbonier',
          province: 'Córdoba'
        }
      },
      {
        name: 'EcoTaller Sustentable',
        email: 'ecotaller@example.com',
        password: await bcrypt.hash('password123', 12),
        userType: 'producer',
        phone: '+54 351 555-0123',
        location: {
          address: 'Zona Industrial, Charbonier',
          coordinates: { lat: -31.4195, lng: -64.1900 },
          city: 'Charbonier',
          province: 'Córdoba'
        }
      }
    ];

    const createdUsers = await User.insertMany(users);
    console.log(`✅ ${createdUsers.length + 1} usuarios creados`);

    // Crear productos de ejemplo
    const products = [
      {
        title: 'Mesa de madera en buen estado',
        description: 'Mesa de comedor de madera maciza, ideal para reparar o reutilizar. Tiene algunas marcas de uso pero la estructura está sólida.',
        category: 'furniture',
        condition: 'good',
        images: [{
          url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
          publicId: 'sample_table'
        }],
        weight: 25,
        dimensions: { length: 150, width: 80, height: 75, unit: 'cm' },
        location: {
          address: 'Calle Principal 123, Charbonier',
          coordinates: { lat: -31.4205, lng: -64.1890 },
          city: 'Charbonier',
          province: 'Córdoba'
        },
        owner: createdUsers[0]._id,
        tags: ['madera', 'comedor', 'reparar'],
        materialType: 'madera'
      },
      {
        title: 'Heladera pequeña funcionando',
        description: 'Heladera de 120 litros, funciona perfectamente. La dono porque me mudé y no la necesito.',
        category: 'appliances',
        condition: 'excellent',
        images: [{
          url: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800',
          publicId: 'sample_fridge'
        }],
        weight: 35,
        dimensions: { length: 50, width: 55, height: 85, unit: 'cm' },
        location: {
          address: 'Av. San Martín 456, Charbonier',
          coordinates: { lat: -31.4210, lng: -64.1885 },
          city: 'Charbonier',
          province: 'Córdoba'
        },
        owner: createdUsers[1]._id,
        tags: ['electrodoméstico', 'cocina', 'funcional'],
        materialType: 'metal'
      },
      {
        title: 'Libros de programación',
        description: 'Colección de 15 libros sobre programación y desarrollo web. Incluye JavaScript, Python, React y más.',
        category: 'books',
        condition: 'good',
        images: [{
          url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
          publicId: 'sample_books'
        }],
        weight: 8,
        location: {
          address: 'Zona Industrial, Charbonier',
          coordinates: { lat: -31.4195, lng: -64.1900 },
          city: 'Charbonier',
          province: 'Córdoba'
        },
        owner: createdUsers[2]._id,
        tags: ['educación', 'tecnología', 'programación'],
        materialType: 'papel'
      },
      {
        title: 'Bicicleta de montaña para reparar',
        description: 'Bicicleta rodado 26, necesita algunas reparaciones menores. Ideal para alguien que sepa de mecánica.',
        category: 'sports',
        condition: 'fair',
        images: [{
          url: 'https://images.unsplash.com/photo-1544191696-15693eb9e221?w=800',
          publicId: 'sample_bike'
        }],
        weight: 15,
        location: {
          address: 'Calle Principal 123, Charbonier',
          coordinates: { lat: -31.4205, lng: -64.1890 },
          city: 'Charbonier',
          province: 'Córdoba'
        },
        owner: createdUsers[0]._id,
        tags: ['deporte', 'transporte', 'reparar'],
        materialType: 'metal'
      }
    ];

    const createdProducts = await Product.insertMany(products);
    console.log(`✅ ${createdProducts.length} productos creados`);

    console.log('\n🎉 Base de datos poblada exitosamente!');
    console.log('\n👤 Usuarios de prueba:');
    console.log('Admin: admin@charbonier.gob.ar / admin123');
    console.log('Usuario 1: maria@example.com / password123');
    console.log('Usuario 2: juan@example.com / password123');
    console.log('Productor: ecotaller@example.com / password123');

  } catch (error) {
    console.error('❌ Error poblando la base de datos:', error);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
// routes/products.js
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Product = require('../models/Product');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Obtener productos con filtros y paginación
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Página inválida'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Límite inválido'),
  query('category').optional().isIn(['electronics', 'furniture', 'clothing', 'books', 'tools', 'appliances', 'sports', 'toys', 'kitchen', 'garden', 'other']),
  query('condition').optional().isIn(['excellent', 'good', 'fair', 'poor']),
  query('lat').optional().isFloat().withMessage('Latitud inválida'),
  query('lng').optional().isFloat().withMessage('Longitud inválida'),
  query('radius').optional().isFloat({ min: 0 }).withMessage('Radio inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Construir filtros
    const filters = { status: 'available' };
    
    if (req.query.category) filters.category = req.query.category;
    if (req.query.condition) filters.condition = req.query.condition;
    if (req.query.search) {
      filters.$text = { $search: req.query.search };
    }

    let query = Product.find(filters);

    // Filtro geoespacial
    if (req.query.lat && req.query.lng) {
      const radius = parseFloat(req.query.radius) || 10; // 10km por defecto
      query = query.find({
        'location.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(req.query.lng), parseFloat(req.query.lat)]
            },
            $maxDistance: radius * 1000 // metros
          }
        }
      });
    }

    const products = await query
      .populate('owner', 'name avatar reputation')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Product.countDocuments(filters);

    res.json({
      products,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener producto por ID
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('owner', 'name avatar reputation location phone');

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Incrementar views
    await Product.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

    res.json({ product });
  } catch (error) {
    console.error('Error obteniendo producto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Crear nuevo producto
router.post('/', authMiddleware, upload.array('images', 5), [
  body('title').trim().isLength({ min: 5, max: 100 }).withMessage('El título debe tener entre 5 y 100 caracteres'),
  body('description').trim().isLength({ min: 10, max: 1000 }).withMessage('La descripción debe tener entre 10 y 1000 caracteres'),
  body('category').isIn(['electronics', 'furniture', 'clothing', 'books', 'tools', 'appliances', 'sports', 'toys', 'kitchen', 'garden', 'other']),
  body('condition').isIn(['excellent', 'good', 'fair', 'poor']),
  body('location.address').notEmpty().withMessage('La dirección es requerida'),
  body('location.coordinates.lat').isFloat().withMessage('Latitud inválida'),
  body('location.coordinates.lng').isFloat().withMessage('Longitud inválida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const productData = {
      ...req.body,
      owner: req.user.userId,
      images: req.files ? req.files.map(file => ({
        url: file.path,
        publicId: file.filename
      })) : []
    };

    const product = new Product(productData);
    await product.save();

    // Actualizar estadísticas del usuario
    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { 'stats.productsOffered': 1 }
    });

    const populatedProduct = await Product.findById(product._id)
      .populate('owner', 'name avatar reputation');

    res.status(201).json({
      message: 'Producto creado exitosamente',
      product: populatedProduct
    });
  } catch (error) {
    console.error('Error creando producto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Actualizar producto
router.put('/:id', authMiddleware, upload.array('images', 5), async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      owner: req.user.userId
    });

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado o no autorizado' });
    }

    // Actualizar datos
    Object.keys(req.body).forEach(key => {
      product[key] = req.body[key];
    });

    // Agregar nuevas imágenes si existen
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => ({
        url: file.path,
        publicId: file.filename
      }));
      product.images = [...product.images, ...newImages];
    }

    await product.save();

    const updatedProduct = await Product.findById(product._id)
      .populate('owner', 'name avatar reputation');

    res.json({
      message: 'Producto actualizado exitosamente',
      product: updatedProduct
    });
  } catch (error) {
    console.error('Error actualizando producto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Eliminar producto
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.userId },
      { status: 'removed' },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado o no autorizado' });
    }

    res.json({ message: 'Producto eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando producto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

module.exports = router;
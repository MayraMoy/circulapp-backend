const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const upload = require('../middleware/upload');

const router = express.Router();

// Obtener perfil del usuario actual
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Obtener estadísticas adicionales
    const [productsCount, transactionsCount] = await Promise.all([
      Product.countDocuments({ owner: req.user.userId }),
      Transaction.countDocuments({
        $or: [
          { donor: req.user.userId },
          { recipient: req.user.userId }
        ]
      })
    ]);

    const userWithStats = user.toObject();
    userWithStats.additionalStats = {
      totalProducts: productsCount,
      totalTransactions: transactionsCount
    };

    res.json({ user: userWithStats });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Actualizar perfil del usuario
router.put('/profile', upload.single('avatar'), [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('phone').optional().isMobilePhone('es-AR').withMessage('Teléfono inválido'),
  body('location.address').optional().notEmpty().withMessage('La dirección no puede estar vacía'),
  body('location.coordinates.lat').optional().isFloat().withMessage('Latitud inválida'),
  body('location.coordinates.lng').optional().isFloat().withMessage('Longitud inválida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const updateData = { ...req.body };
    
    // Si se subió una nueva imagen de avatar
    if (req.file) {
      updateData.avatar = req.file.path;
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener perfil público de otro usuario
router.get('/:userId/public', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('name avatar location reputation stats createdAt')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Obtener productos activos del usuario
    const activeProducts = await Product.find({
      owner: req.params.userId,
      status: 'available'
    })
    .select('title images category createdAt')
    .limit(6)
    .sort({ createdAt: -1 });

    res.json({
      user: {
        ...user,
        activeProducts
      }
    });
  } catch (error) {
    console.error('Error obteniendo perfil público:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener productos del usuario actual
router.get('/my-products', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status || 'all';

    // Construir filtros
    const filters = { owner: req.user.userId };
    if (status !== 'all') {
      filters.status = status;
    }

    const products = await Product.find(filters)
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
    console.error('Error obteniendo productos del usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener historial de transacciones del usuario
router.get('/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const type = req.query.type || 'all'; // 'all', 'donated', 'received'

    // Construir filtros
    let filters = {};
    if (type === 'donated') {
      filters.donor = req.user.userId;
    } else if (type === 'received') {
      filters.recipient = req.user.userId;
    } else {
      filters.$or = [
        { donor: req.user.userId },
        { recipient: req.user.userId }
      ];
    }

    const transactions = await Transaction.find(filters)
      .populate('product', 'title images')
      .populate('donor', 'name avatar')
      .populate('recipient', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments(filters);

    res.json({
      transactions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error obteniendo transacciones:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Cambiar contraseña
router.put('/change-password', [
  body('currentPassword').notEmpty().withMessage('La contraseña actual es requerida'),
  body('newPassword').isLength({ min: 6 }).withMessage('La nueva contraseña debe tener al menos 6 caracteres'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Las contraseñas no coinciden');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Verificar contraseña actual
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: 'Contraseña actual incorrecta' });
    }

    // Actualizar contraseña
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Desactivar cuenta
router.put('/deactivate', [
  body('password').notEmpty().withMessage('La contraseña es requerida para desactivar la cuenta'),
  body('reason').optional().isLength({ max: 500 }).withMessage('La razón no puede exceder 500 caracteres')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password, reason } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Verificar contraseña
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Contraseña incorrecta' });
    }

    // Desactivar cuenta
    user.isActive = false;
    if (reason) {
      user.deactivationReason = reason;
    }
    user.deactivatedAt = new Date();
    await user.save();

    // También cambiar el estado de los productos activos a 'removed'
    await Product.updateMany(
      { owner: req.user.userId, status: 'available' },
      { status: 'removed' }
    );

    res.json({ message: 'Cuenta desactivada exitosamente' });
  } catch (error) {
    console.error('Error desactivando cuenta:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener estadísticas del dashboard del usuario
router.get('/dashboard-stats', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const [
      totalProductsOffered,
      activeProducts,
      completedDonations,
      totalReceived,
      pendingRequests,
      averageRating
    ] = await Promise.all([
      Product.countDocuments({ owner: userId }),
      Product.countDocuments({ owner: userId, status: 'available' }),
      Transaction.countDocuments({ donor: userId, status: 'completed' }),
      Transaction.countDocuments({ recipient: userId, status: 'completed' }),
      Transaction.countDocuments({ 
        $or: [
          { donor: userId, status: 'pending' },
          { recipient: userId, status: 'pending' }
        ]
      }),
      User.findById(userId).select('reputation.average')
    ]);

    // Transacciones por mes (últimos 6 meses)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const transactionsByMonth = await Transaction.aggregate([
      {
        $match: {
          $or: [{ donor: userId }, { recipient: userId }],
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          donated: {
            $sum: { $cond: [{ $eq: ['$donor', userId] }, 1, 0] }
          },
          received: {
            $sum: { $cond: [{ $eq: ['$recipient', userId] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      stats: {
        totalProductsOffered,
        activeProducts,
        completedDonations,
        totalReceived,
        pendingRequests,
        averageRating: averageRating?.reputation?.average || 0
      },
      charts: {
        transactionsByMonth
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas del dashboard:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

module.exports = router;


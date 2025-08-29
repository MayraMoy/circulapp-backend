// routes/admin.js
const express = require('express');
const User = require('../models/User');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const Review = require('../models/Review');
const adminMiddleware = require('../middleware/admin');

const router = express.Router();

// Middleware para verificar rol de admin
router.use(adminMiddleware);

// Dashboard estadísticas
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      totalProducts,
      totalTransactions,
      activeProducts,
      completedTransactions,
      pendingTransactions
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Product.countDocuments(),
      Transaction.countDocuments(),
      Product.countDocuments({ status: 'available' }),
      Transaction.countDocuments({ status: 'completed' }),
      Transaction.countDocuments({ status: 'pending' })
    ]);

    // Estadísticas por categoría
    const productsByCategory = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    // Transacciones por mes (últimos 6 meses)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const transactionsByMonth = await Transaction.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      stats: {
        totalUsers,
        totalProducts,
        totalTransactions,
        activeProducts,
        completedTransactions,
        pendingTransactions
      },
      charts: {
        productsByCategory,
        transactionsByMonth
      }
    });
  } catch (error) {
    console.error('Error obteniendo dashboard:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Gestión de usuarios
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments();

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Suspender/reactivar usuario
router.patch('/users/:userId/status', async (req, res) => {
  try {
    const { isActive } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json({
      message: `Usuario ${isActive ? 'reactivado' : 'suspendido'} exitosamente`,
      user
    });
  } catch (error) {
    console.error('Error actualizando estado de usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Gestión de productos reportados
router.get('/products/reported', async (req, res) => {
  try {
    // Aquí implementarías la lógica para productos reportados
    // Por ahora, devolvemos productos recientes para demostración
    const products = await Product.find()
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ products });
  } catch (error) {
    console.error('Error obteniendo productos reportados:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Remover producto
router.delete('/products/:productId', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.productId,
      { status: 'removed' },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json({ message: 'Producto removido exitosamente' });
  } catch (error) {
    console.error('Error removiendo producto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

module.exports = router;
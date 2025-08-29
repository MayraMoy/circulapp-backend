// routes/reviews.js
const express = require('express');
const Review = require('../models/Review');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Crear reseña
router.post('/', [
  body('transactionId').isMongoId().withMessage('ID de transacción inválido'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Calificación debe ser entre 1 y 5'),
  body('comment').optional().isLength({ max: 500 }).withMessage('Comentario muy largo'),
  body('categories.communication').optional().isInt({ min: 1, max: 5 }),
  body('categories.punctuality').optional().isInt({ min: 1, max: 5 }),
  body('categories.productCondition').optional().isInt({ min: 1, max: 5 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { transactionId, rating, comment, categories } = req.body;

    // Verificar que la transacción existe y está completada
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transacción no encontrada' });
    }

    if (transaction.status !== 'completed') {
      return res.status(400).json({ message: 'Solo se pueden calificar transacciones completadas' });
    }

    // Verificar que el usuario es parte de la transacción
    const isParticipant = transaction.donor.toString() === req.user.userId || 
                         transaction.recipient.toString() === req.user.userId;
    
    if (!isParticipant) {
      return res.status(403).json({ message: 'No autorizado para calificar esta transacción' });
    }

    // Determinar quién recibe la reseña
    const reviewee = transaction.donor.toString() === req.user.userId ? 
                    transaction.recipient : transaction.donor;

    // Verificar que no exista ya una reseña
    const existingReview = await Review.findOne({
      transaction: transactionId,
      reviewer: req.user.userId
    });

    if (existingReview) {
      return res.status(409).json({ message: 'Ya has calificado esta transacción' });
    }

    // Crear nueva reseña
    const review = new Review({
      transaction: transactionId,
      reviewer: req.user.userId,
      reviewee,
      rating,
      comment,
      categories
    });

    await review.save();

    // Actualizar reputación del usuario calificado
    const reviews = await Review.find({ reviewee });
    const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    await User.findByIdAndUpdate(reviewee, {
      'reputation.average': Math.round(averageRating * 10) / 10,
      'reputation.count': reviews.length
    });

    const populatedReview = await Review.findById(review._id)
      .populate('reviewer', 'name avatar')
      .populate('reviewee', 'name avatar');

    res.status(201).json({
      message: 'Reseña creada exitosamente',
      review: populatedReview
    });
  } catch (error) {
    console.error('Error creando reseña:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener reseñas de un usuario
router.get('/user/:userId', async (req, res) => {
  try {
    const reviews = await Review.find({ reviewee: req.params.userId })
      .populate('reviewer', 'name avatar')
      .populate('transaction', 'product')
      .populate({
        path: 'transaction',
        populate: {
          path: 'product',
          select: 'title images'
        }
      })
      .sort({ createdAt: -1 });

    res.json({ reviews });
  } catch (error) {
    console.error('Error obteniendo reseñas:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

module.exports = router;

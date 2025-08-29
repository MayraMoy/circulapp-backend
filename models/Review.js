// models/Review.js
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reviewee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: [true, 'La calificación es requerida'],
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    maxlength: [500, 'El comentario no puede exceder 500 caracteres']
  },
  categories: {
    communication: { type: Number, min: 1, max: 5 },
    punctuality: { type: Number, min: 1, max: 5 },
    productCondition: { type: Number, min: 1, max: 5 }
  }
}, {
  timestamps: true
});

// Prevent duplicate reviews for same transaction
reviewSchema.index({ transaction: 1, reviewer: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);

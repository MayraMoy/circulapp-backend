// models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'El título es requerido'],
    trim: true,
    maxlength: [100, 'El título no puede exceder 100 caracteres']
  },
  description: {
    type: String,
    required: [true, 'La descripción es requerida'],
    maxlength: [1000, 'La descripción no puede exceder 1000 caracteres']
  },
  category: {
    type: String,
    required: [true, 'La categoría es requerida'],
    enum: [
      'electronics', 'furniture', 'clothing', 'books', 
      'tools', 'appliances', 'sports', 'toys', 
      'kitchen', 'garden', 'other'
    ]
  },
  condition: {
    type: String,
    required: [true, 'El estado es requerido'],
    enum: ['excellent', 'good', 'fair', 'poor']
  },
  images: [{
    url: String,
    publicId: String // Para Cloudinary
  }],
  weight: {
    type: Number,
    min: 0
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    unit: {
      type: String,
      enum: ['cm', 'm'],
      default: 'cm'
    }
  },
  location: {
    address: {
      type: String,
      required: [true, 'La dirección es requerida']
    },
    coordinates: {
      lat: {
        type: Number,
        required: true
      },
      lng: {
        type: Number,
        required: true
      }
    },
    city: String,
    province: String
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['available', 'reserved', 'donated', 'removed'],
    default: 'available'
  },
  availability: {
    startDate: Date,
    endDate: Date,
    timeSlots: [{
      day: {
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      },
      startTime: String,
      endTime: String
    }]
  },
  tags: [String],
  views: {
    type: Number,
    default: 0
  },
  isCompacted: {
    type: Boolean,
    default: false
  },
  materialType: String // Para clasificación de materiales reciclables
}, {
  timestamps: true
});

// Index for geospatial queries
productSchema.index({ "location.coordinates": "2dsphere" });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ owner: 1 });
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
// models/Product.js (Enhanced)
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
    publicId: String,
    type: {
      type: String,
      enum: ['general', 'compacted', 'close_up', 'measurement', 'label', 'validation'],
      default: 'general'
    },
    aiAnalysis: {
      materialType: String,
      estimatedWeight: Number,
      compactionQuality: Number, // 0-100
      qualityScore: Number, // 0-100
      detectedIssues: [String]
    }
  }],
  weight: {
    declared: {
      type: Number,
      min: 0
    },
    estimated: {
      type: Number,
      min: 0
    },
    actual: {
      type: Number,
      min: 0
    },
    unit: {
      type: String,
      enum: ['g', 'kg', 'ton'],
      default: 'kg'
    }
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    unit: {
      type: String,
      enum: ['cm', 'm'],
      default: 'cm'
    },
    volume: Number // calculado automáticamente
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
    province: String,
    zone: String,
    landmark: String
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'available', 'reserved', 'donated', 'removed', 'expired'],
    default: 'available'
  },
  // === NUEVAS FUNCIONALIDADES ===
  materialAnalysis: {
    material: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material'
    },
    materialType: String,
    subMaterialType: String,
    estimatedWeight: Number,
    compactionStatus: {
      type: String,
      enum: ['pending', 'validated', 'rejected', 'not_required'],
      default: 'pending'
    },
    validationImages: [String],
    recyclingValue: {
      type: Number,
      default: 0
    },
    carbonFootprintSaved: {
      type: Number,
      default: 0
    },
    environmentalImpact: {
      waterSaved: Number, // litros
      energySaved: Number, // kWh
      equivalentTrees: Number,
      co2Reduction: Number // kg CO2
    },
    qualityAssessment: {
      overallScore: { type: Number, min: 0, max: 100 },
      compactionQuality: { type: Number, min: 0, max: 100 },
      purityLevel: { type: Number, min: 0, max: 100 },
      contamination: [String],
      recommendations: [String]
    },
    validatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    validatedAt: Date,
    validationNotes: String,
    aiValidation: {
      confidence: Number, // 0-100
      predictions: [{
        type: String,
        confidence: Number,
        boundingBox: {
          x: Number,
          y: Number,
          width: Number,
          height: Number
        }
      }],
      processedAt: Date
    }
  },
  
  pickupOptions: {
    allowsPickup: {
      type: Boolean,
      default: true
    },
    schedulePreferences: [{
      day: {
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      },
      timeStart: String,
      timeEnd: String,
      preferred: { type: Boolean, default: false }
    }],
    deliveryRadius: {
      type: Number,
      default: 5,
      min: 0
    },
    requiresAssistance: {
      type: Boolean,
      default: false
    },
    assistanceType: [String], // ['loading', 'transport', 'disassembly']
    specialInstructions: String,
    accessNotes: String, // instrucciones de acceso al domicilio
    contactPreference: {
      type: String,
      enum: ['phone', 'message', 'email', 'any'],
      default: 'any'
    }
  },
  
  availability: {
    startDate: Date,
    endDate: Date,
    isUrgent: { type: Boolean, default: false },
    urgencyReason: String,
    timeSlots: [{
      day: {
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      },
      startTime: String,
      endTime: String,
      recurring: { type: Boolean, default: true }
    }],
    blackoutDates: [Date], // fechas no disponibles
    flexibleSchedule: { type: Boolean, default: false }
  },
  
  // Información adicional del producto
  additionalInfo: {
    brand: String,
    model: String,
    yearPurchased: Number,
    originalPrice: Number,
    purchaseLocation: String,
    warranty: {
      hasWarranty: { type: Boolean, default: false },
      expiryDate: Date,
      transferable: { type: Boolean, default: false }
    },
    manuals: [String], // URLs de manuales
    accessories: [String],
    missingParts: [String],
    repairHistory: [{
      date: Date,
      description: String,
      cost: Number,
      repairer: String
    }]
  },
  
  tags: [String],
  views: {
    type: Number,
    default: 0
  },
  
  // Métricas y análisis
  analytics: {
    viewsByDate: [{
      date: { type: Date, default: Date.now },
      views: { type: Number, default: 1 }
    }],
    searchKeywords: [String],
    contactAttempts: {
      type: Number,
      default: 0
    },
    averageResponseTime: Number, // minutos
    popularityScore: { type: Number, default: 0 }
  },
  
  // Estado de procesamiento
  processing: {
    isProcessed: { type: Boolean, default: false },
    processedAt: Date,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    batchNumber: String,
    finalDestination: String,
    processingNotes: String
  },
  
  // Sistema de reportes integrado
  reports: [{
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    status: {
      type: String,
      enum: ['pending', 'reviewing', 'resolved', 'dismissed'],
      default: 'pending'
    },
    reportedAt: { type: Date, default: Date.now }
  }],
  
  isCompacted: {
    type: Boolean,
    default: false
  },
  materialType: String // Para clasificación de materiales reciclables
}, {
  timestamps: true
});

// Índices optimizados
productSchema.index({ "location.coordinates": "2dsphere" });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ owner: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ 'materialAnalysis.materialType': 1 });
productSchema.index({ 'materialAnalysis.compactionStatus': 1 });
productSchema.index({ status: 1, 'availability.endDate': 1 });
productSchema.index({ 'pickupOptions.allowsPickup': 1, status: 1 });

// Middleware para calcular volumen automáticamente
productSchema.pre('save', function(next) {
  if (this.dimensions.length && this.dimensions.width && this.dimensions.height) {
    const factor = this.dimensions.unit === 'm' ? 1 : 0.000001; // convertir cm3 a m3
    this.dimensions.volume = this.dimensions.length * this.dimensions.width * this.dimensions.height * factor;
  }
  next();
});

// Método para calcular impacto ambiental
productSchema.methods.calculateEnvironmentalImpact = function() {
  const weight = this.weight.actual || this.weight.estimated || this.weight.declared || 0;
  
  if (!weight || !this.materialAnalysis.materialType) {
    return {
      carbonFootprintSaved: 0,
      waterSaved: 0,
      energySaved: 0,
      equivalentTrees: 0
    };
  }
  
  // Factores de impacto por tipo de material (valores aproximados)
  const impactFactors = {
    'plastic': { co2: 2.1, water: 2.5, energy: 2.0 },
    'paper': { co2: 1.3, water: 10, energy: 1.5 },
    'metal': { co2: 3.5, water: 8, energy: 4.0 },
    'glass': { co2: 0.8, water: 0.5, energy: 0.8 },
    'textile': { co2: 2.8, water: 20, energy: 3.0 },
    'electronic': { co2: 15, water: 15, energy: 10.0 },
    'wood': { co2: 1.1, water: 3, energy: 1.2 },
    'other': { co2: 1.5, water: 2, energy: 1.0 }
  };
  
  const factor = impactFactors[this.materialAnalysis.materialType] || impactFactors.other;
  
  return {
    carbonFootprintSaved: weight * factor.co2,
    waterSaved: weight * factor.water,
    energySaved: weight * factor.energy,
    equivalentTrees: (weight * factor.co2) / 22 // 1 árbol = ~22kg CO2/año
  };
};

// Método para verificar disponibilidad en fecha específica
productSchema.methods.isAvailableOn = function(date) {
  if (this.status !== 'available') return false;
  
  const checkDate = new Date(date);
  const today = new Date();
  
  // Verificar si la fecha está en el rango de disponibilidad
  if (this.availability.startDate && checkDate < this.availability.startDate) return false;
  if (this.availability.endDate && checkDate > this.availability.endDate) return false;
  
  // Verificar fechas bloqueadas
  if (this.availability.blackoutDates) {
    const isBlackedOut = this.availability.blackoutDates.some(blackout => 
      blackout.toDateString() === checkDate.toDateString()
    );
    if (isBlackedOut) return false;
  }
  
  return true;
};

// Método para obtener estadísticas del producto
productSchema.methods.getStatistics = function() {
  const environmentalImpact = this.calculateEnvironmentalImpact();
  
  return {
    views: this.views,
    contactAttempts: this.analytics.contactAttempts,
    popularityScore: this.analytics.popularityScore,
    environmentalImpact,
    daysListed: Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24)),
    validationStatus: this.materialAnalysis.compactionStatus,
    qualityScore: this.materialAnalysis.qualityAssessment?.overallScore || 0
  };
};

// Método para actualizar popularidad
productSchema.methods.updatePopularity = function() {
  const daysSinceCreation = (Date.now() - this.createdAt) / (1000 * 60 * 60 * 24);
  const viewsPerDay = this.views / Math.max(daysSinceCreation, 1);
  const contactRate = this.analytics.contactAttempts / Math.max(this.views, 1);
  
  // Fórmula para calcular popularidad (0-100)
  this.analytics.popularityScore = Math.min(100, Math.round(
    (viewsPerDay * 10) + (contactRate * 50) + (this.views * 0.1)
  ));
  
  return this.analytics.popularityScore;
};

module.exports = mongoose.model('Product', productSchema);
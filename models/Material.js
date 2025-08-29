// models/Material.js
const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre del material es requerido'],
    trim: true,
    maxlength: [100, 'El nombre no puede exceder 100 caracteres']
  },
  category: {
    type: String,
    required: [true, 'La categoría es requerida'],
    enum: ['plastic', 'paper', 'metal', 'glass', 'organic', 'electronic', 'textile', 'wood', 'other']
  },
  subCategory: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    maxlength: [500, 'La descripción no puede exceder 500 caracteres']
  },
  compactionInstructions: {
    type: String,
    required: [true, 'Las instrucciones de compactación son requeridas'],
    maxlength: [2000, 'Las instrucciones no pueden exceder 2000 caracteres']
  },
  recyclingValue: {
    type: Number,
    min: 0,
    default: 0
  },
  carbonFootprintSaved: {
    type: Number, // kg CO2 ahorrado por kg de material
    min: 0,
    default: 0
  },
  standardWeight: {
    type: Number, // kg por unidad estándar
    min: 0,
    required: [true, 'El peso estándar es requerido']
  },
  validationCriteria: {
    minWeight: {
      type: Number,
      min: 0,
      required: true
    },
    maxWeight: {
      type: Number,
      min: 0,
      required: true
    },
    requiredImages: [{
      type: {
        type: String,
        enum: ['general', 'compacted', 'close_up', 'measurement', 'label']
      },
      description: String,
      required: { type: Boolean, default: true }
    }],
    compactionRequired: {
      type: Boolean,
      default: true
    },
    qualityStandards: [{
      criterion: String,
      description: String,
      required: { type: Boolean, default: true }
    }]
  },
  processingInstructions: {
    steps: [String],
    tools: [String],
    safetyWarnings: [String],
    estimatedTime: Number // minutos
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date
}, {
  timestamps: true
});

// Índices
materialSchema.index({ category: 1, isActive: 1 });
materialSchema.index({ name: 'text', description: 'text' });

// Método para calcular impacto ambiental
materialSchema.methods.calculateEnvironmentalImpact = function(weight) {
  return {
    carbonFootprintSaved: this.carbonFootprintSaved * weight,
    recyclingValue: this.recyclingValue * weight,
    equivalentTrees: (this.carbonFootprintSaved * weight) / 22, // 1 árbol = ~22kg CO2/año
    waterSaved: this.getWaterSavings(weight),
    energySaved: this.getEnergySavings(weight)
  };
};

// Método para obtener ahorro de agua por categoría
materialSchema.methods.getWaterSavings = function(weight) {
  const waterSavingsPerKg = {
    'plastic': 2.5, // litros
    'paper': 10,
    'metal': 8,
    'glass': 0.5,
    'textile': 20,
    'electronic': 15,
    'other': 2
  };
  
  return (waterSavingsPerKg[this.category] || 2) * weight;
};

// Método para obtener ahorro de energía por categoría
materialSchema.methods.getEnergySavings = function(weight) {
  const energySavingsPerKg = {
    'plastic': 2.0, // kWh
    'paper': 1.5,
    'metal': 4.0,
    'glass': 0.8,
    'textile': 3.0,
    'electronic': 10.0,
    'other': 1.0
  };
  
  return (energySavingsPerKg[this.category] || 1) * weight;
};

// Validación personalizada
materialSchema.pre('save', function(next) {
  if (this.validationCriteria.minWeight >= this.validationCriteria.maxWeight) {
    next(new Error('El peso mínimo debe ser menor al peso máximo'));
  }
  next();
});

module.exports = mongoose.model('Material', materialSchema);
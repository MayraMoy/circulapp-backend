// models/CollectionSchedule.js
const mongoose = require('mongoose');

const routePointSchema = new mongoose.Schema({
  coordinates: {
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180
    }
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  estimatedTime: Date,
  actualTime: Date,
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'skipped'],
    default: 'pending'
  },
  notes: String,
  collectedWeight: Number,
  collectorNotes: String
});

const collectionScheduleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'El título es requerido'],
    trim: true,
    maxlength: [100, 'El título no puede exceder 100 caracteres']
  },
  zone: {
    type: String,
    required: [true, 'La zona es requerida'],
    trim: true
  },
  area: {
    type: String,
    trim: true
  },
  dayOfWeek: {
    type: String,
    required: [true, 'El día de la semana es requerido'],
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  },
  timeSlot: {
    start: {
      type: String,
      required: true,
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora inválido (HH:MM)']
    },
    end: {
      type: String,
      required: true,
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora inválido (HH:MM)']
    }
  },
  frequency: {
    type: String,
    enum: ['weekly', 'biweekly', 'monthly'],
    default: 'weekly'
  },
  materialTypes: [{
    type: String,
    required: true,
    enum: ['plastic', 'paper', 'metal', 'glass', 'organic', 'electronic', 'textile', 'wood', 'other']
  }],
  capacity: {
    current: {
      type: Number,
      min: 0,
      default: 0
    },
    maximum: {
      type: Number,
      min: 1,
      required: true
    },
    unit: {
      type: String,
      enum: ['kg', 'items', 'm3'],
      default: 'kg'
    }
  },
  route: [routePointSchema],
  vehicle: {
    type: {
      type: String,
      enum: ['truck', 'van', 'car', 'bicycle', 'walking'],
      default: 'truck'
    },
    plateNumber: String,
    capacity: Number,
    fuelType: {
      type: String,
      enum: ['gasoline', 'diesel', 'electric', 'hybrid', 'other']
    }
  },
  collector: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled'],
    default: 'scheduled'
  },
  scheduledDate: {
    type: Date,
    required: true
  },
  completedDate: Date,
  weather: {
    condition: String,
    temperature: Number,
    affecting: { type: Boolean, default: false }
  },
  results: {
    totalWeight: { type: Number, default: 0 },
    totalItems: { type: Number, default: 0 },
    pointsCompleted: { type: Number, default: 0 },
    pointsSkipped: { type: Number, default: 0 },
    duration: Number, // minutos
    fuelUsed: Number,
    carbonFootprint: Number,
    issues: [String]
  },
  notifications: {
    sent: { type: Boolean, default: false },
    sentAt: Date,
    reminder: { type: Boolean, default: false },
    reminderSentAt: Date
  },
  recurring: {
    enabled: { type: Boolean, default: false },
    interval: Number, // días
    endDate: Date,
    parentSchedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CollectionSchedule'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Índices
collectionScheduleSchema.index({ zone: 1, scheduledDate: 1 });
collectionScheduleSchema.index({ dayOfWeek: 1, status: 1 });
collectionScheduleSchema.index({ collector: 1, scheduledDate: 1 });
collectionScheduleSchema.index({ materialTypes: 1 });
collectionScheduleSchema.index({ 'route.coordinates': '2dsphere' });

// Middleware para validar horarios
collectionScheduleSchema.pre('save', function(next) {
  const startTime = this.timeSlot.start.split(':');
  const endTime = this.timeSlot.end.split(':');
  const start = parseInt(startTime[0]) * 60 + parseInt(startTime[1]);
  const end = parseInt(endTime[0]) * 60 + parseInt(endTime[1]);
  
  if (start >= end) {
    next(new Error('La hora de inicio debe ser anterior a la hora de fin'));
  }
  
  if (this.scheduledDate < new Date()) {
    next(new Error('La fecha programada no puede ser en el pasado'));
  }
  
  next();
});

// Método para calcular duración estimada
collectionScheduleSchema.methods.calculateEstimatedDuration = function() {
  const baseTimePerPoint = 15; // minutos
  const travelTimePerKm = 5; // minutos por km (estimado)
  const routePoints = this.route.length;
  
  let totalDistance = 0;
  for (let i = 1; i < this.route.length; i++) {
    // Fórmula simple de distancia euclidiana (se podría mejorar con API de mapas)
    const prev = this.route[i - 1].coordinates;
    const curr = this.route[i].coordinates;
    const distance = Math.sqrt(
      Math.pow((curr.lat - prev.lat) * 111, 2) + 
      Math.pow((curr.lng - prev.lng) * 85, 2)
    );
    totalDistance += distance;
  }
  
  return (routePoints * baseTimePerPoint) + (totalDistance * travelTimePerKm);
};

// Método para optimizar ruta
collectionScheduleSchema.methods.optimizeRoute = function() {
  // Implementación básica del algoritmo nearest neighbor
  if (this.route.length <= 2) return this.route;
  
  const optimized = [this.route[0]]; // Empezar desde el primer punto
  const remaining = [...this.route.slice(1)];
  
  while (remaining.length > 0) {
    const current = optimized[optimized.length - 1];
    let nearestIndex = 0;
    let shortestDistance = Infinity;
    
    remaining.forEach((point, index) => {
      const distance = Math.sqrt(
        Math.pow((point.coordinates.lat - current.coordinates.lat) * 111, 2) +
        Math.pow((point.coordinates.lng - current.coordinates.lng) * 85, 2)
      );
      
      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearestIndex = index;
      }
    });
    
    optimized.push(remaining[nearestIndex]);
    remaining.splice(nearestIndex, 1);
  }
  
  return optimized;
};

// Método para verificar capacidad disponible
collectionScheduleSchema.methods.hasCapacity = function(additionalWeight = 0) {
  return (this.capacity.current + additionalWeight) <= this.capacity.maximum;
};

// Método para calcular estadísticas
collectionScheduleSchema.methods.getStatistics = function() {
  const completionRate = this.route.length > 0 
    ? (this.results.pointsCompleted / this.route.length) * 100 
    : 0;
    
  const efficiency = this.results.duration > 0 
    ? this.results.totalWeight / this.results.duration 
    : 0;
    
  return {
    completionRate: Math.round(completionRate),
    efficiency: Math.round(efficiency * 100) / 100,
    carbonFootprintPerKg: this.results.totalWeight > 0 
      ? this.results.carbonFootprint / this.results.totalWeight 
      : 0,
    averageTimePerPoint: this.results.pointsCompleted > 0 
      ? this.results.duration / this.results.pointsCompleted 
      : 0
  };
};

module.exports = mongoose.model('CollectionSchedule', collectionScheduleSchema);
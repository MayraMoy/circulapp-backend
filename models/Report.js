// models/Report.js
const mongoose = require('mongoose');

const actionTakenSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['warning', 'suspension', 'removal', 'ban', 'no_action', 'education', 'mediation'],
    required: true
  },
  description: String,
  duration: Number, // días para suspensiones temporales
  automaticRevert: Date,
  notificationSent: { type: Boolean, default: false },
  takenBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  takenAt: { type: Date, default: Date.now }
});

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El reportador es requerido']
  },
  reportType: {
    type: String,
    required: [true, 'El tipo de reporte es requerido'],
    enum: [
      'inappropriate_content',
      'fraud',
      'spam',
      'safety_concern',
      'fake_product',
      'harassment',
      'scam',
      'violence_threat',
      'hate_speech',
      'copyright_violation',
      'privacy_violation',
      'underage_user',
      'technical_issue',
      'material_contamination',
      'incorrect_compaction',
      'dangerous_material',
      'other'
    ]
  },
  subType: String, // subcategoría específica del reporte
  target: {
    targetType: {
      type: String,
      enum: ['user', 'product', 'transaction', 'chat', 'review'],
      required: true
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    targetTitle: String, // título del producto, nombre del usuario, etc.
    targetUrl: String // URL para referencia rápida
  },
  description: {
    type: String,
    required: [true, 'La descripción es requerida'],
    maxlength: [2000, 'La descripción no puede exceder 2000 caracteres']
  },
  evidence: [{
    type: {
      type: String,
      enum: ['image', 'screenshot', 'document', 'link', 'video'],
      required: true
    },
    url: String,
    description: String,
    metadata: {
      fileSize: Number,
      mimeType: String,
      uploadedAt: { type: Date, default: Date.now }
    }
  }],
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['content', 'behavior', 'safety', 'technical', 'legal', 'environmental'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'reviewing', 'investigating', 'resolved', 'dismissed', 'escalated'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedAt: Date,
  
  // Seguimiento del proceso
  timeline: [{
    action: String,
    description: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed
  }],
  
  // Investigación
  investigation: {
    findings: String,
    evidence_summary: String,
    interviews: [{
      interviewee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      notes: String,
      date: Date,
      interviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    relatedReports: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Report'
    }],
    externalReferences: [String]
  },
  
  // Resolución
  resolution: {
    summary: String,
    reasoning: String,
    actionsTaken: [actionTakenSchema],
    preventiveMeasures: [String],
    followUpRequired: { type: Boolean, default: false },
    followUpDate: Date,
    satisfactionRating: {
      type: Number,
      min: 1,
      max: 5
    },
    reporterFeedback: String
  },
  
  adminNotes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: { type: Date, default: Date.now },
    private: { type: Boolean, default: true }
  }],
  
  // Notificaciones y comunicación
  communications: [{
    type: {
      type: String,
      enum: ['email', 'in_app', 'sms', 'chat']
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    subject: String,
    message: String,
    sentAt: Date,
    readAt: Date,
    responseRequired: { type: Boolean, default: false }
  }],
  
  // Métricas y análisis
  metrics: {
    responseTime: Number, // minutos desde creación hasta primera respuesta
    resolutionTime: Number, // minutos desde creación hasta resolución
    escalations: { type: Number, default: 0 },
    reopened: { type: Number, default: 0 },
    similarReportsCount: { type: Number, default: 0 }
  },
  
  // Automatización
  automation: {
    aiClassification: {
      confidence: Number,
      suggestedCategory: String,
      suggestedSeverity: String,
      flags: [String]
    },
    autoActions: [{
      action: String,
      triggeredAt: Date,
      success: Boolean,
      errorMessage: String
    }]
  },
  
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Control de calidad
  qualityCheck: {
    reviewed: { type: Boolean, default: false },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date,
    qualityScore: {
      type: Number,
      min: 1,
      max: 10
    },
    improvements: [String]
  },
  
  // Campos de auditoría
  isAnonymous: { type: Boolean, default: false },
  ipAddress: String,
  userAgent: String,
  source: {
    type: String,
    enum: ['web', 'mobile', 'api', 'admin_panel'],
    default: 'web'
  }
}, {
  timestamps: true
});

// Índices para optimización
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ 'target.targetType': 1, 'target.targetId': 1 });
reportSchema.index({ status: 1, priority: 1 });
reportSchema.index({ assignedTo: 1, status: 1 });
reportSchema.index({ reportType: 1, category: 1 });
reportSchema.index({ severity: 1, createdAt: -1 });
reportSchema.index({ resolvedAt: 1 });

// Middleware para calcular métricas automáticamente
reportSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    const now = new Date();
    
    // Calcular tiempo de respuesta (primera vez que sale de 'pending')
    if (this.status !== 'pending' && !this.metrics.responseTime) {
      this.metrics.responseTime = Math.round((now - this.createdAt) / (1000 * 60));
    }
    
    // Calcular tiempo de resolución
    if (['resolved', 'dismissed'].includes(this.status) && !this.resolvedAt) {
      this.resolvedAt = now;
      this.metrics.resolutionTime = Math.round((now - this.createdAt) / (1000 * 60));
    }
    
    // Agregar al timeline
    this.timeline.push({
      action: 'status_change',
      description: `Estado cambiado a: ${this.status}`,
      timestamp: now
    });
  }
  
  next();
});

// Método para clasificar automáticamente la severidad
reportSchema.methods.classifySeverity = function() {
  const criticalKeywords = ['amenaza', 'violencia', 'peligro', 'menor', 'drogas', 'armas'];
  const highKeywords = ['fraude', 'estafa', 'acoso', 'discriminación'];
  const mediumKeywords = ['spam', 'contenido inapropiado', 'falso'];
  
  const description = this.description.toLowerCase();
  
  if (criticalKeywords.some(keyword => description.includes(keyword))) {
    this.severity = 'critical';
    this.priority = 'urgent';
  } else if (highKeywords.some(keyword => description.includes(keyword))) {
    this.severity = 'high';
    this.priority = 'high';
  } else if (mediumKeywords.some(keyword => description.includes(keyword))) {
    this.severity = 'medium';
    this.priority = 'normal';
  } else {
    this.severity = 'low';
    this.priority = 'low';
  }
};

// Método para encontrar reportes relacionados
reportSchema.methods.findRelatedReports = async function() {
  const relatedReports = await mongoose.model('Report').find({
    _id: { $ne: this._id },
    $or: [
      { 'target.targetId': this.target.targetId },
      { reporter: this.reporter },
      { reportType: this.reportType, 'target.targetType': this.target.targetType }
    ],
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // últimos 30 días
  }).limit(10);
  
  this.investigation.relatedReports = relatedReports.map(r => r._id);
  this.metrics.similarReportsCount = relatedReports.length;
  
  return relatedReports;
};

// Método para generar resumen ejecutivo
reportSchema.methods.generateSummary = function() {
  return {
    id: this._id,
    type: this.reportType,
    severity: this.severity,
    target: `${this.target.targetType}: ${this.target.targetTitle}`,
    status: this.status,
    timeOpen: this.resolvedAt 
      ? Math.round((this.resolvedAt - this.createdAt) / (1000 * 60 * 60 * 24)) + ' días'
      : Math.round((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24)) + ' días',
    actionsTaken: this.resolution.actionsTaken?.length || 0,
    escalated: this.metrics.escalations > 0
  };
};

// Método estático para obtener estadísticas
reportSchema.statics.getStatistics = async function(timeframe = 30) {
  const startDate = new Date(Date.now() - timeframe * 24 * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        dismissed: { $sum: { $cond: [{ $eq: ['$status', 'dismissed'] }, 1, 0] } },
        avgResponseTime: { $avg: '$metrics.responseTime' },
        avgResolutionTime: { $avg: '$metrics.resolutionTime' },
        byType: { $push: '$reportType' },
        bySeverity: { $push: '$severity' }
      }
    }
  ]);
  
  return stats[0] || {};
};

module.exports = mongoose.model('Report', reportSchema);
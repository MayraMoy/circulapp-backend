// routes/municipal.js
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const CollectionSchedule = require('../models/CollectionSchedule');
const Product = require('../models/Product');
const Material = require('../models/Material');
const Report = require('../models/Report');
const User = require('../models/User');
const adminMiddleware = require('../middleware/admin');

const router = express.Router();

// Middleware para verificar permisos municipales
router.use(adminMiddleware);

// === GESTIÓN DE CRONOGRAMA DE RECOLECCIÓN ===

// Obtener cronograma de recolección
router.get('/collection-schedule', [
  query('zone').optional().isString(),
  query('date').optional().isISO8601(),
  query('status').optional().isIn(['scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const filters = { isActive: true };
    if (req.query.zone) filters.zone = req.query.zone;
    if (req.query.status) filters.status = req.query.status;
    
    if (req.query.date) {
      const date = new Date(req.query.date);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      filters.scheduledDate = { $gte: date, $lt: nextDay };
    }

    const schedules = await CollectionSchedule.find(filters)
      .populate('collector', 'name phone')
      .populate('route.products', 'title weight materialType')
      .sort({ scheduledDate: 1, 'timeSlot.start': 1 });

    // Calcular estadísticas
    const stats = {
      total: schedules.length,
      byStatus: {},
      totalCapacity: 0,
      usedCapacity: 0
    };

    schedules.forEach(schedule => {
      stats.byStatus[schedule.status] = (stats.byStatus[schedule.status] || 0) + 1;
      stats.totalCapacity += schedule.capacity.maximum;
      stats.usedCapacity += schedule.capacity.current;
    });

    res.json({
      schedules,
      stats,
      utilizationRate: stats.totalCapacity > 0 
        ? Math.round((stats.usedCapacity / stats.totalCapacity) * 100) 
        : 0
    });
  } catch (error) {
    console.error('Error obteniendo cronograma:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Crear nuevo cronograma de recolección
router.post('/collection-schedule', [
  body('title').notEmpty().withMessage('El título es requerido'),
  body('zone').notEmpty().withMessage('La zona es requerida'),
  body('dayOfWeek').isIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
  body('timeSlot.start').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('timeSlot.end').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('materialTypes').isArray().withMessage('Los tipos de material deben ser un array'),
  body('capacity.maximum').isNumeric().withMessage('La capacidad máxima debe ser numérica'),
  body('scheduledDate').isISO8601().withMessage('Fecha programada inválida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const scheduleData = {
      ...req.body,
      createdBy: req.user.userId
    };

    const schedule = new CollectionSchedule(scheduleData);
    await schedule.save();

    // Si es recurrente, crear cronogramas futuros
    if (req.body.recurring?.enabled) {
      await createRecurringSchedules(schedule, req.body.recurring);
    }

    res.status(201).json({
      message: 'Cronograma de recolección creado exitosamente',
      schedule
    });
  } catch (error) {
    console.error('Error creando cronograma:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Optimizar ruta de recolección
router.patch('/collection-schedule/:id/optimize-route', async (req, res) => {
  try {
    const schedule = await CollectionSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ message: 'Cronograma no encontrado' });
    }

    const originalRoute = [...schedule.route];
    schedule.route = schedule.optimizeRoute();
    
    const estimatedDuration = schedule.calculateEstimatedDuration();
    schedule.estimatedDuration = estimatedDuration;
    
    await schedule.save();

    res.json({
      message: 'Ruta optimizada exitosamente',
      originalPoints: originalRoute.length,
      optimizedPoints: schedule.route.length,
      estimatedDuration: `${Math.round(estimatedDuration)} minutos`,
      estimatedSavings: originalRoute.length > 0 
        ? `${Math.round(((originalRoute.length - schedule.route.length) / originalRoute.length) * 100)}%`
        : '0%'
    });
  } catch (error) {
    console.error('Error optimizando ruta:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// === VALIDACIÓN DE MATERIALES ===

// Validar material compactado
router.post('/validate-material', [
  body('productId').isMongoId().withMessage('ID de producto inválido'),
  body('validationResult').isIn(['validated', 'rejected']).withMessage('Resultado de validación inválido'),
  body('notes').optional().isLength({ max: 1000 }).withMessage('Las notas son muy largas')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, validationResult, notes, qualityScore, recommendations } = req.body;

    const product = await Product.findById(productId).populate('owner');
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Actualizar estado de validación
    product.materialAnalysis.compactionStatus = validationResult;
    product.materialAnalysis.validatedBy = req.user.userId;
    product.materialAnalysis.validatedAt = new Date();
    product.materialAnalysis.validationNotes = notes;

    if (qualityScore) {
      product.materialAnalysis.qualityAssessment.overallScore = qualityScore;
    }

    if (recommendations) {
      product.materialAnalysis.qualityAssessment.recommendations = recommendations;
    }

    // Calcular impacto ambiental si es validado
    if (validationResult === 'validated') {
      const environmentalImpact = product.calculateEnvironmentalImpact();
      product.materialAnalysis.environmentalImpact = environmentalImpact;
      
      // Actualizar valor de reciclaje basado en el material
      if (product.materialAnalysis.material) {
        const material = await Material.findById(product.materialAnalysis.material);
        if (material) {
          const weight = product.weight.actual || product.weight.estimated || product.weight.declared || 0;
          product.materialAnalysis.recyclingValue = material.recyclingValue * weight;
        }
      }
    }

    await product.save();

    // Notificar al propietario (se puede implementar sistema de notificaciones)
    const notificationMessage = validationResult === 'validated' 
      ? 'Tu material ha sido validado exitosamente'
      : 'Tu material necesita mejoras en la compactación';

    res.json({
      message: 'Material validado exitosamente',
      validationResult,
      environmentalImpact: product.materialAnalysis.environmentalImpact,
      recommendations: product.materialAnalysis.qualityAssessment.recommendations
    });
  } catch (error) {
    console.error('Error validando material:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener materiales pendientes de validación
router.get('/materials/pending-validation', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('materialType').optional().isString(),
  query('zone').optional().isString()
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filters = { 
      'materialAnalysis.compactionStatus': 'pending',
      status: 'available'
    };

    if (req.query.materialType) {
      filters['materialAnalysis.materialType'] = req.query.materialType;
    }

    if (req.query.zone) {
      filters['location.zone'] = req.query.zone;
    }

    const products = await Product.find(filters)
      .populate('owner', 'name location phone')
      .populate('materialAnalysis.material', 'name compactionInstructions')
      .sort({ createdAt: 1 }) // más antiguos primero
      .skip(skip)
      .limit(limit);

    const total = await Product.countDocuments(filters);

    // Estadísticas por tipo de material
    const materialStats = await Product.aggregate([
      { $match: filters },
      { $group: { _id: '$materialAnalysis.materialType', count: { $sum: 1 } } }
    ]);

    res.json({
      products,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      },
      materialStats
    });
  } catch (error) {
    console.error('Error obteniendo materiales pendientes:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// === GESTIÓN DE REPORTES ===

// Obtener reportes municipales
router.get('/reports', [
  query('status').optional().isIn(['pending', 'reviewing', 'investigating', 'resolved', 'dismissed', 'escalated']),
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('category').optional().isIn(['content', 'behavior', 'safety', 'technical', 'legal', 'environmental']),
  query('assignedTo').optional().isMongoId(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.severity) filters.severity = req.query.severity;
    if (req.query.category) filters.category = req.query.category;
    if (req.query.assignedTo) filters.assignedTo = req.query.assignedTo;

    const reports = await Report.find(filters)
      .populate('reporter', 'name email')
      .populate('assignedTo', 'name')
      .populate('resolvedBy', 'name')
      .sort({ 
        priority: -1, // urgent first
        createdAt: -1 
      })
      .skip(skip)
      .limit(limit);

    const total = await Report.countDocuments(filters);

    // Estadísticas de reportes
    const stats = await Report.getStatistics(30); // últimos 30 días

    res.json({
      reports: reports.map(report => ({
        ...report.toObject(),
        summary: report.generateSummary()
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      },
      stats
    });
  } catch (error) {
    console.error('Error obteniendo reportes:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Asignar reporte a administrador
router.patch('/reports/:id/assign', [
  body('assignedTo').isMongoId().withMessage('ID de administrador inválido')
], async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    const assignee = await User.findById(req.body.assignedTo);
    if (!assignee || assignee.userType !== 'comuna') {
      return res.status(400).json({ message: 'El usuario asignado debe ser administrador municipal' });
    }

    report.assignedTo = req.body.assignedTo;
    report.assignedAt = new Date();
    report.status = 'reviewing';
    
    report.timeline.push({
      action: 'assigned',
      description: `Asignado a ${assignee.name}`,
      performedBy: req.user.userId
    });

    await report.save();

    res.json({
      message: 'Reporte asignado exitosamente',
      assignedTo: assignee.name
    });
  } catch (error) {
    console.error('Error asignando reporte:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// === ANALYTICS Y MÉTRICAS ===

// Obtener analytics municipales
router.get('/analytics', [
  query('period').optional().isIn(['7d', '30d', '90d', '1y']),
  query('zone').optional().isString()
], async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const days = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    }[period];

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const filters = { createdAt: { $gte: startDate } };
    
    if (req.query.zone) {
      filters['location.zone'] = req.query.zone;
    }

    // Métricas de productos y materiales
    const [
      totalProducts,
      validatedMaterials,
      pendingValidation,
      totalWeight,
      environmentalImpact,
      topMaterials,
      collectionEfficiency
    ] = await Promise.all([
      Product.countDocuments(filters),
      Product.countDocuments({ 
        ...filters, 
        'materialAnalysis.compactionStatus': 'validated' 
      }),
      Product.countDocuments({ 
        ...filters, 
        'materialAnalysis.compactionStatus': 'pending' 
      }),
      Product.aggregate([
        { $match: filters },
        { $group: { _id: null, total: { $sum: '$weight.actual' } } }
      ]),
      Product.aggregate([
        { $match: { ...filters, 'materialAnalysis.compactionStatus': 'validated' } },
        {
          $group: {
            _id: null,
            totalCO2: { $sum: '$materialAnalysis.environmentalImpact.co2Reduction' },
            totalWater: { $sum: '$materialAnalysis.environmentalImpact.waterSaved' },
            totalEnergy: { $sum: '$materialAnalysis.environmentalImpact.energySaved' }
          }
        }
      ]),
      Product.aggregate([
        { $match: filters },
        { $group: { _id: '$materialAnalysis.materialType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      CollectionSchedule.aggregate([
        { $match: { scheduledDate: { $gte: startDate } } },
        {
          $group: {
            _id: null,
            totalScheduled: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            totalWeight: { $sum: '$results.totalWeight' },
            avgDuration: { $avg: '$results.duration' }
          }
        }
      ])
    ]);

    // Datos para gráficos temporales
    const dailyStats = await Product.aggregate([
      { $match: filters },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
          },
          products: { $sum: 1 },
          weight: { $sum: '$weight.actual' }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    res.json({
      summary: {
        totalProducts,
        validatedMaterials,
        pendingValidation: pendingValidation,
        validationRate: totalProducts > 0 ? Math.round((validatedMaterials / totalProducts) * 100) : 0,
        totalWeight: totalWeight[0]?.total || 0,
        collectionEfficiency: collectionEfficiency[0]?.completed && collectionEfficiency[0]?.totalScheduled > 0
          ? Math.round((collectionEfficiency[0].completed / collectionEfficiency[0].totalScheduled) * 100)
          : 0
      },
      environmentalImpact: environmentalImpact[0] || {
        totalCO2: 0,
        totalWater: 0,
        totalEnergy: 0
      },
      topMaterials,
      dailyStats,
      period
    });
  } catch (error) {
    console.error('Error obteniendo analytics:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// === GESTIÓN DE PRODUCTORES ===

// Aprobar perfil de productor
router.patch('/approve-producer/:userId', [
  body('approved').isBoolean().withMessage('El estado de aprobación debe ser booleano'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Las notas son muy largas')
], async (req, res) => {
  try {
    const { approved, notes } = req.body;
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (user.userType !== 'producer') {
      return res.status(400).json({ message: 'El usuario debe ser de tipo productor' });
    }

    // Actualizar estado de verificación
    user.isVerified = approved;
    user.verificationNotes = notes;
    user.verifiedBy = req.user.userId;
    user.verifiedAt = new Date();

    await user.save();

    // Si es aprobado, puede activar productos
    if (approved) {
      await Product.updateMany(
        { owner: req.params.userId, status: 'draft' },
        { status: 'available' }
      );
    }

    res.json({
      message: `Productor ${approved ? 'aprobado' : 'rechazado'} exitosamente`,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Error aprobando productor:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener productores pendientes de aprobación
router.get('/producers/pending', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const producers = await User.find({
      userType: 'producer',
      isVerified: false,
      isActive: true
    })
    .select('-password')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit);

    const total = await User.countDocuments({
      userType: 'producer',
      isVerified: false,
      isActive: true
    });

    // Obtener estadísticas adicionales para cada productor
    const producersWithStats = await Promise.all(
      producers.map(async (producer) => {
        const [productCount, avgRating] = await Promise.all([
          Product.countDocuments({ owner: producer._id }),
          // Aquí podrías obtener ratings si tienes sistema de reviews
          Promise.resolve(0)
        ]);

        return {
          ...producer.toObject(),
          stats: {
            productCount,
            avgRating,
            daysSinceRegistration: Math.floor((Date.now() - producer.createdAt) / (1000 * 60 * 60 * 24))
          }
        };
      })
    );

    res.json({
      producers: producersWithStats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    });
  } catch (error) {
    console.error('Error obteniendo productores pendientes:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// === GESTIÓN DE ZONAS ===

// Obtener estadísticas por zona
router.get('/zones/stats', async (req, res) => {
  try {
    const zoneStats = await Product.aggregate([
      {
        $match: {
          'location.zone': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$location.zone',
          totalProducts: { $sum: 1 },
          totalWeight: { $sum: '$weight.actual' },
          validatedProducts: {
            $sum: { $cond: [{ $eq: ['$materialAnalysis.compactionStatus', 'validated'] }, 1, 0] }
          },
          avgWeight: { $avg: '$weight.actual' },
          materialTypes: { $addToSet: '$materialAnalysis.materialType' }
        }
      },
      {
        $project: {
          zone: '$_id',
          totalProducts: 1,
          totalWeight: { $round: ['$totalWeight', 2] },
          validatedProducts: 1,
          validationRate: {
            $round: [
              { $multiply: [{ $divide: ['$validatedProducts', '$totalProducts'] }, 100] },
              1
            ]
          },
          avgWeight: { $round: ['$avgWeight', 2] },
          materialTypes: 1,
          _id: 0
        }
      },
      { $sort: { totalProducts: -1 } }
    ]);

    // Obtener estadísticas de recolección por zona
    const collectionStats = await CollectionSchedule.aggregate([
      {
        $match: {
          scheduledDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: '$zone',
          totalSchedules: { $sum: 1 },
          completedSchedules: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          totalCollected: { $sum: '$results.totalWeight' },
          avgEfficiency: { $avg: '$results.duration' }
        }
      }
    ]);

    // Combinar estadísticas
    const combinedStats = zoneStats.map(zone => {
      const collectionData = collectionStats.find(c => c._id === zone.zone) || {};
      return {
        ...zone,
        collection: {
          totalSchedules: collectionData.totalSchedules || 0,
          completedSchedules: collectionData.completedSchedules || 0,
          completionRate: collectionData.totalSchedules > 0 
            ? Math.round((collectionData.completedSchedules / collectionData.totalSchedules) * 100)
            : 0,
          totalCollected: collectionData.totalCollected || 0,
          avgEfficiency: collectionData.avgEfficiency || 0
        }
      };
    });

    res.json({
      zones: combinedStats,
      summary: {
        totalZones: combinedStats.length,
        mostActiveZone: combinedStats[0]?.zone || 'N/A',
        totalProducts: combinedStats.reduce((sum, zone) => sum + zone.totalProducts, 0),
        totalWeight: combinedStats.reduce((sum, zone) => sum + zone.totalWeight, 0)
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas de zonas:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// === FUNCIONES AUXILIARES ===

// Función para crear cronogramas recurrentes
async function createRecurringSchedules(baseSchedule, recurringConfig) {
  const { interval, endDate } = recurringConfig;
  const schedules = [];
  
  let currentDate = new Date(baseSchedule.scheduledDate);
  const finalDate = new Date(endDate);
  
  while (currentDate <= finalDate) {
    currentDate.setDate(currentDate.getDate() + interval);
    
    if (currentDate <= finalDate) {
      const newSchedule = new CollectionSchedule({
        ...baseSchedule.toObject(),
        _id: undefined,
        scheduledDate: new Date(currentDate),
        recurring: {
          ...recurringConfig,
          parentSchedule: baseSchedule._id
        }
      });
      
      schedules.push(newSchedule);
    }
  }
  
  if (schedules.length > 0) {
    await CollectionSchedule.insertMany(schedules);
  }
  
  return schedules.length;
}

module.exports = router;
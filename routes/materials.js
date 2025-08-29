// routes/materials.js
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Material = require('../models/Material');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const router = express.Router();

// === RUTAS PÚBLICAS ===

// Obtener catálogo de materiales
router.get('/', [
  query('category').optional().isIn(['plastic', 'paper', 'metal', 'glass', 'organic', 'electronic', 'textile', 'wood', 'other']),
  query('search').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filters = { isActive: true };
    
    if (req.query.category) {
      filters.category = req.query.category;
    }

    let query = Material.find(filters);

    // Búsqueda por texto
    if (req.query.search) {
      query = query.find({
        $text: { $search: req.query.search }
      });
    }

    const materials = await query
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ category: 1, name: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Material.countDocuments(filters);

    // Estadísticas por categoría
    const categoryStats = await Material.aggregate([
      { $match: filters },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      materials,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      },
      categoryStats
    });
  } catch (error) {
    console.error('Error obteniendo materiales:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener material específico con instrucciones
router.get('/:id', async (req, res) => {
  try {
    const material = await Material.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name');

    if (!material || !material.isActive) {
      return res.status(404).json({ message: 'Material no encontrado' });
    }

    // Obtener estadísticas de uso del material
    const usageStats = await Product.aggregate([
      { $match: { 'materialAnalysis.material': material._id } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalWeight: { $sum: '$weight.actual' },
          avgWeight: { $avg: '$weight.actual' },
          validatedCount: {
            $sum: { $cond: [{ $eq: ['$materialAnalysis.compactionStatus', 'validated'] }, 1, 0] }
          }
        }
      }
    ]);

    const stats = usageStats[0] || {
      totalProducts: 0,
      totalWeight: 0,
      avgWeight: 0,
      validatedCount: 0
    };

    res.json({
      material,
      usageStatistics: {
        ...stats,
        validationRate: stats.totalProducts > 0 
          ? Math.round((stats.validatedCount / stats.totalProducts) * 100) 
          : 0
      }
    });
  } catch (error) {
    console.error('Error obteniendo material:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Calcular impacto ambiental estimado
router.post('/:id/calculate-impact', [
  body('weight').isNumeric().withMessage('El peso debe ser numérico').isFloat({ min: 0.1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const material = await Material.findById(req.params.id);
    if (!material || !material.isActive) {
      return res.status(404).json({ message: 'Material no encontrado' });
    }

    const { weight } = req.body;
    const impact = material.calculateEnvironmentalImpact(weight);

    res.json({
      material: {
        id: material._id,
        name: material.name,
        category: material.category
      },
      weight,
      environmentalImpact: impact,
      recommendations: [
        `Con ${weight}kg de ${material.name} podrías ahorrar ${impact.carbonFootprintSaved.toFixed(2)}kg de CO2`,
        `Esto equivale a plantar ${impact.equivalentTrees.toFixed(1)} árboles`,
        `Ahorrarías ${impact.waterSaved.toFixed(0)} litros de agua`,
        `Y ${impact.energySaved.toFixed(2)} kWh de energía`
      ]
    });
  } catch (error) {
    console.error('Error calculando impacto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// === RUTAS AUTENTICADAS ===

router.use(authMiddleware);

// Sugerir material para producto
router.post('/suggest', [
  body('productId').isMongoId().withMessage('ID de producto inválido'),
  body('description').optional().isString(),
  body('images').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, description, images } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    if (product.owner.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'No autorizado para este producto' });
    }

    // Buscar materiales similares basados en la categoría del producto
    const categoryMapping = {
      'electronics': 'electronic',
      'furniture': 'wood',
      'clothing': 'textile',
      'books': 'paper',
      'appliances': 'metal',
      'kitchen': 'metal',
      'toys': 'plastic'
    };

    const suggestedCategory = categoryMapping[product.category] || 'other';
    
    const suggestedMaterials = await Material.find({
      category: suggestedCategory,
      isActive: true
    }).limit(5);

    // Si no hay materiales específicos, buscar por palabras clave
    if (suggestedMaterials.length === 0) {
      const keywordSearch = await Material.find({
        $text: { $search: product.title + ' ' + product.description },
        isActive: true
      }).limit(5);
      
      suggestedMaterials.push(...keywordSearch);
    }

    res.json({
      productId,
      suggestedMaterials: suggestedMaterials.map(material => ({
        id: material._id,
        name: material.name,
        category: material.category,
        compactionInstructions: material.compactionInstructions,
        recyclingValue: material.recyclingValue,
        estimatedImpact: material.calculateEnvironmentalImpact(
          product.weight.declared || product.weight.estimated || 1
        ),
        confidence: calculateConfidence(product, material)
      }))
    });
  } catch (error) {
    console.error('Error sugiriendo materiales:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Reportar problema con material
router.post('/:id/report', [
  body('issueType').isIn(['incorrect_instructions', 'outdated_info', 'missing_info', 'other']),
  body('description').notEmpty().withMessage('La descripción es requerida'),
  body('suggestion').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const material = await Material.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ message: 'Material no encontrado' });
    }

    // Crear reporte (usando el modelo Report existente)
    const Report = require('../models/Report');
    
    const report = new Report({
      reporter: req.user.userId,
      reportType: 'technical_issue',
      target: {
        targetType: 'material',
        targetId: material._id,
        targetTitle: material.name
      },
      description: `${req.body.issueType}: ${req.body.description}`,
      category: 'environmental',
      severity: 'medium',
      subType: req.body.issueType
    });

    if (req.body.suggestion) {
      report.adminNotes.push({
        note: `Sugerencia del usuario: ${req.body.suggestion}`,
        addedBy: req.user.userId,
        private: false
      });
    }

    await report.save();

    res.status(201).json({
      message: 'Reporte enviado exitosamente',
      reportId: report._id
    });
  } catch (error) {
    console.error('Error creando reporte de material:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// === RUTAS DE ADMINISTRACIÓN ===

// Crear nuevo material (solo administradores)
router.post('/', adminMiddleware, [
  body('name').notEmpty().withMessage('El nombre es requerido'),
  body('category').isIn(['plastic', 'paper', 'metal', 'glass', 'organic', 'electronic', 'textile', 'wood', 'other']),
  body('compactionInstructions').notEmpty().withMessage('Las instrucciones son requeridas'),
  body('standardWeight').isNumeric().withMessage('El peso estándar debe ser numérico'),
  body('validationCriteria.minWeight').isNumeric(),
  body('validationCriteria.maxWeight').isNumeric()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const materialData = {
      ...req.body,
      createdBy: req.user.userId,
      approvedBy: req.user.userId,
      approvedAt: new Date()
    };

    const material = new Material(materialData);
    await material.save();

    res.status(201).json({
      message: 'Material creado exitosamente',
      material
    });
  } catch (error) {
    console.error('Error creando material:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Actualizar material
router.put('/:id', adminMiddleware, async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ message: 'Material no encontrado' });
    }

    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'createdBy' && key !== 'createdAt') {
        material[key] = req.body[key];
      }
    });

    material.approvedBy = req.user.userId;
    material.approvedAt = new Date();

    await material.save();

    res.json({
      message: 'Material actualizado exitosamente',
      material
    });
  } catch (error) {
    console.error('Error actualizando material:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Desactivar material
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ message: 'Material no encontrado' });
    }

    material.isActive = false;
    await material.save();

    res.json({ message: 'Material desactivado exitosamente' });
  } catch (error) {
    console.error('Error desactivando material:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener estadísticas de materiales
router.get('/admin/statistics', adminMiddleware, async (req, res) => {
  try {
    const stats = await Material.aggregate([
      {
        $facet: {
          byCategory: [
            { $match: { isActive: true } },
            { $group: { _id: '$category', count: { $sum: 1 } } }
          ],
          usage: [
            {
              $lookup: {
                from: 'products',
                localField: '_id',
                foreignField: 'materialAnalysis.material',
                as: 'products'
              }
            },
            {
              $project: {
                name: 1,
                category: 1,
                usageCount: { $size: '$products' },
                avgRecyclingValue: '$recyclingValue'
              }
            },
            { $sort: { usageCount: -1 } },
            { $limit: 10 }
          ],
          environmental: [
            {
              $group: {
                _id: null,
                totalMaterials: { $sum: 1 },
                avgRecyclingValue: { $avg: '$recyclingValue' },
                avgCarbonSavings: { $avg: '$carbonFootprintSaved' }
              }
            }
          ]
        }
      }
    ]);

    res.json({
      categoryDistribution: stats[0].byCategory,
      mostUsedMaterials: stats[0].usage,
      environmentalMetrics: stats[0].environmental[0] || {}
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas de materiales:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// === FUNCIONES AUXILIARES ===

function calculateConfidence(product, material) {
  let confidence = 50; // base confidence
  
  // Aumentar confianza si coincide la categoría
  const categoryMapping = {
    'electronics': 'electronic',
    'furniture': 'wood',
    'clothing': 'textile',
    'books': 'paper',
    'appliances': 'metal',
    'kitchen': 'metal',
    'toys': 'plastic'
  };
  
  if (categoryMapping[product.category] === material.category) {
    confidence += 30;
  }
  
  // Aumentar confianza si hay palabras clave comunes
  const productWords = (product.title + ' ' + product.description).toLowerCase();
  const materialWords = (material.name + ' ' + material.description).toLowerCase();
  
  const commonWords = productWords.split(' ').filter(word => 
    word.length > 3 && materialWords.includes(word)
  );
  
  confidence += Math.min(commonWords.length * 5, 20);
  
  return Math.min(confidence, 95);
}

module.exports = router;
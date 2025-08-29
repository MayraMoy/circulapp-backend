// middleware/security.js
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { body, query, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { cacheHelper } = require('../config/redis');

// Advanced Rate Limiting
const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100, skipSuccessfulRequests = false) => {
  return rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    store: new Map(), // En producción usar Redis store
    keyGenerator: (req) => {
      // Usar IP + User Agent para mejor identificación
      return `${req.ip}:${crypto.createHash('md5').update(req.get('User-Agent') || '').digest('hex')}`;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'Demasiadas solicitudes',
        message: 'Has excedido el límite de solicitudes. Intenta nuevamente más tarde.',
        retryAfter: Math.round(windowMs / 1000)
      });
    },
    onLimitReached: (req, res, options) => {
      console.warn(`Rate limit alcanzado para IP: ${req.ip}, User-Agent: ${req.get('User-Agent')}`);
    }
  });
};

// Speed Limiting (slow down responses)
const createSpeedLimiter = (windowMs = 15 * 60 * 1000, delayAfter = 50) => {
  return slowDown({
    windowMs,
    delayAfter,
    delayMs: 500, // delay per request after delayAfter
    maxDelayMs: 5000, // max delay
    skipFailedRequests: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
      return `${req.ip}:${crypto.createHash('md5').update(req.get('User-Agent') || '').digest('hex')}`;
    }
  });
};

// Rate limiters específicos
const authLimiter = createRateLimiter(15 * 60 * 1000, 10); // 10 intentos de auth por 15 min
const generalLimiter = createRateLimiter(15 * 60 * 1000, 200); // 200 requests por 15 min
const searchLimiter = createRateLimiter(60 * 1000, 30); // 30 búsquedas por minuto
const uploadLimiter = createRateLimiter(60 * 60 * 1000, 50); // 50 uploads por hora

// Advanced input validation and sanitization
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove potentially dangerous characters
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/data:/gi, '')
        .trim();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => sanitize(item));
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitize(obj[key]);
        }
      }
      return sanitized;
    }
    
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  
  next();
};

// SQL Injection protection (aunque usamos MongoDB, es buena práctica)
const preventSQLInjection = (req, res, next) => {
  const sqlPatterns = [
    /(\s*(union|select|insert|delete|update|drop|create|alter|exec|execute)\s+)/i,
    /(\s*(or|and)\s+['"0-9])/i,
    /(script|javascript|vbscript)/i,
    /(\s*(;|'|"|`)\s*)/,
    /(\/\*.*?\*\/)/
  ];

  const checkForSQLInjection = (obj) => {
    if (typeof obj === 'string') {
      return sqlPatterns.some(pattern => pattern.test(obj));
    }
    
    if (Array.isArray(obj)) {
      return obj.some(item => checkForSQLInjection(item));
    }
    
    if (obj && typeof obj === 'object') {
      return Object.values(obj).some(value => checkForSQLInjection(value));
    }
    
    return false;
  };

  if (checkForSQLInjection(req.body) || 
      checkForSQLInjection(req.query) || 
      checkForSQLInjection(req.params)) {
    
    console.warn(`Potential SQL injection attempt from IP: ${req.ip}`, {
      body: req.body,
      query: req.query,
      params: req.params,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(400).json({
      error: 'Solicitud inválida',
      message: 'Los datos enviados contienen caracteres no permitidos'
    });
  }

  next();
};

// Advanced JWT validation
const enhancedAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    // Check if token is blacklisted
    const isBlacklisted = await cacheHelper.redis.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ message: 'Token inválido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    
    // Additional security checks
    const now = Math.floor(Date.now() / 1000);
    
    // Check token expiration with buffer
    if (decoded.exp && decoded.exp < now + 300) { // 5 minutes before expiry
      return res.status(401).json({ 
        message: 'Token expirando pronto',
        code: 'TOKEN_EXPIRING'
      });
    }

    // Rate limiting per user
    const userLimit = await cacheHelper.checkRateLimit(
      `user:${decoded.userId}`, 
      1000, // 1000 requests per hour per user
      3600
    );
    
    if (userLimit.current > userLimit.limit) {
      return res.status(429).json({
        message: 'Límite de solicitudes por usuario excedido',
        resetTime: userLimit.resetTime
      });
    }

    // Get user from cache or database
    let user = await cacheHelper.getCachedUser(decoded.userId);
    
    if (!user) {
      const User = require('../models/User');
      user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return res.status(401).json({ message: 'Usuario no encontrado' });
      }
      
      // Cache user data
      await cacheHelper.cacheUser(decoded.userId, user.toJSON(), 1800); // 30 min
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Cuenta desactivada' });
    }

    // Add security headers
    res.set({
      'X-User-ID': decoded.userId,
      'X-Rate-Limit-Remaining': userLimit.remaining.toString()
    });

    req.user = { 
      userId: user._id.toString(), 
      email: user.email,
      userType: user.userType,
      isVerified: user.isVerified
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expirado',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Token inválido',
        code: 'TOKEN_INVALID'
      });
    }
    
    console.error('Error en autenticación avanzada:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// CSRF Protection
const csrfProtection = (req, res, next) => {
  // Skip for GET requests and certain endpoints
  if (req.method === 'GET' || req.path.includes('/health')) {
    return next();
  }

  const token = req.get('X-CSRF-Token') || req.body._csrf;
  const sessionToken = req.session?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({
      error: 'CSRF Token inválido',
      message: 'Token CSRF requerido para esta operación'
    });
  }

  next();
};

// Advanced request validation
const validateRequest = (validations) => {
  return async (req, res, next) => {
    // Run validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
      }));

      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: formattedErrors
      });
    }

    next();
  };
};

// File upload security
const secureFileUpload = (req, res, next) => {
  if (!req.files && !req.file) {
    return next();
  }

  const files = req.files || [req.file];
  
  for (const file of files) {
    // Check file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        error: 'Archivo demasiado grande',
        message: 'El tamaño máximo permitido es 5MB'
      });
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'Tipo de archivo no permitido',
        message: 'Solo se permiten imágenes JPEG, PNG y WebP'
      });
    }

    // Check for malicious file names
    const maliciousPatterns = [
      /\.(php|jsp|asp|exe|bat|cmd|sh|py|pl|rb)$/i,
      /\.\./,
      /[<>:"|?*]/
    ];

    if (maliciousPatterns.some(pattern => pattern.test(file.originalname))) {
      return res.status(400).json({
        error: 'Nombre de archivo inválido',
        message: 'El nombre del archivo contiene caracteres no permitidos'
      });
    }
  }

  next();
};

// IP Whitelisting/Blacklisting
const ipFilter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  
  // Blacklisted IPs (en producción esto vendría de base de datos)
  const blacklistedIPs = process.env.BLACKLISTED_IPS?.split(',') || [];
  
  if (blacklistedIPs.includes(ip)) {
    console.warn(`Blocked request from blacklisted IP: ${ip}`);
    return res.status(403).json({
      error: 'Acceso denegado',
      message: 'Su IP está restringida'
    });
  }

  // Whitelist para endpoints sensibles (opcional)
  if (req.path.includes('/admin') || req.path.includes('/municipal')) {
    const whitelistedIPs = process.env.ADMIN_WHITELISTED_IPS?.split(',') || [];
    
    if (whitelistedIPs.length > 0 && !whitelistedIPs.includes(ip)) {
      console.warn(`Blocked admin access from non-whitelisted IP: ${ip}`);
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'Acceso administrativo restringido'
      });
    }
  }

  next();
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; object-src 'none';"
  });
  
  next();
};

// Request logging for security monitoring
const securityLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      duration,
      userId: req.user?.userId || 'anonymous',
      contentLength: res.get('Content-Length') || 0
    };

    // Log suspicious activities
    if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) {
      console.warn('Security Alert:', logData);
    }

    // Log slow requests
    if (duration > 5000) {
      console.warn('Slow Request:', logData);
    }
  });

  next();
};

module.exports = {
  authLimiter,
  generalLimiter,
  searchLimiter,
  uploadLimiter,
  createRateLimiter,
  createSpeedLimiter,
  sanitizeInput,
  preventSQLInjection,
  enhancedAuthMiddleware,
  csrfProtection,
  validateRequest,
  secureFileUpload,
  ipFilter,
  securityHeaders,
  securityLogger
};
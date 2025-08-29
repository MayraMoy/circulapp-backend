// utils/logger.js
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Crear directorio de logs si no existe
const logDir = path.join(__dirname, '../logs');
fs.mkdirSync(logDir, { recursive: true });

// Formato personalizado para logs
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (stack) {
      log += `\nStack: ${stack}`;
    }
    
    if (Object.keys(meta).length > 0) {
      log += `\nMeta: ${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Configuración de transports
const transports = [
  // Console para desarrollo
  new winston.transports.Console({
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),
  
  // Archivo para errores
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: customFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 5,
    tailable: true
  }),
  
  // Archivo para todos los logs
  new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    format: customFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 10,
    tailable: true
  }),
  
  // Archivo para logs de seguridad
  new winston.transports.File({
    filename: path.join(logDir, 'security.log'),
    level: 'warn',
    format: customFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    tailable: true
  })
];

// Crear logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  transports,
  exitOnError: false,
  handleExceptions: true,
  handleRejections: true
});

// Logger específico para acceso HTTP
const accessLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'access.log'),
      maxsize: 10485760,
      maxFiles: 10
    })
  ]
});

// Logger específico para base de datos
const dbLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'database.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

// Logger específico para performance
const performanceLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'performance.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

// Funciones de utilidad para logging estructurado
class Logger {
  // Logs generales
  static info(message, meta = {}) {
    logger.info(message, meta);
  }

  static warn(message, meta = {}) {
    logger.warn(message, meta);
  }

  static error(message, error = null, meta = {}) {
    const logMeta = { ...meta };
    
    if (error) {
      logMeta.error = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
    }
    
    logger.error(message, logMeta);
  }

  static debug(message, meta = {}) {
    logger.debug(message, meta);
  }

  // Logs de seguridad
  static security(event, details = {}) {
    const securityLog = {
      event,
      timestamp: new Date().toISOString(),
      ...details
    };
    
    logger.warn(`Security Event: ${event}`, securityLog);
  }

  // Logs de autenticación
  static auth(action, userId, details = {}) {
    this.security('AUTH', {
      action,
      userId,
      ...details
    });
  }

  // Logs de acceso HTTP
  static access(req, res, responseTime) {
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    };

    accessLogger.info('HTTP Access Log', logData);
  }

  // Logs de base de datos
  static db(query, duration, meta = {}) {
    const logData = {
      query,
      duration: `${duration}ms`,
      ...meta
    };

    dbLogger.info('Database Query', logData);
  }

  // Logs de performance
  static performance(metric, value, meta = {}) {
    const logData = {
      metric,
      value,
      ...meta
    };

    performanceLogger.info('Performance Metric', logData);
  }
}

module.exports = Logger;
// utils/logger.js
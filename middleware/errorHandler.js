// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Error de Mongoose - Validation
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      message: 'Error de validación',
      errors: errors
    });
  }

  // Error de Mongoose - CastError
  if (err.name === 'CastError') {
    return res.status(400).json({
      message: 'Formato de ID inválido'
    });
  }

  // Error de Mongoose - Duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      message: `El ${field} ya está en uso`
    });
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      message: 'Token inválido'
    });
  }

  // Error de Multer
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'El archivo es demasiado grande'
      });
    }
    return res.status(400).json({
      message: 'Error en la carga del archivo'
    });
  }

  // Error genérico
  res.status(err.status || 500).json({
    message: err.message || 'Error interno del servidor'
  });
};

module.exports = errorHandler;

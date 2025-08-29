// middleware/admin.js
const User = require('../models/User');

const adminMiddleware = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user || user.userType !== 'comuna') {
      return res.status(403).json({ message: 'Acceso denegado. Se requieren permisos de administrador.' });
    }

    next();
  } catch (error) {
    console.error('Error en middleware admin:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

module.exports = adminMiddleware;
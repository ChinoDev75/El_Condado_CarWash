const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'No autorizado para acceder a esta ruta' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('name email role loyalty_points');

    if (!req.user) {
      return res.status(401).json({ message: 'No autorizado' });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'No autorizado' });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'No autorizado' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `El rol de usuario (${req.user.role}) no esta autorizado para acceder a esta ruta`
      });
    }

    return next();
  };
};

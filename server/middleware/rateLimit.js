const buckets = new Map();

const getClientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

exports.rateLimit = ({ windowMs = 15 * 60 * 1000, max = 100, name = 'global' } = {}) => {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${getClientIp(req)}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);

    res.set('Retry-After', String(retryAfterSeconds));

    if (current.count > max) {
      return res.status(429).json({
        message: 'Demasiados intentos. Intenta de nuevo en unos minutos.'
      });
    }

    return next();
  };
};

setInterval(() => {
  const now = Date.now();
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  });
}, 60 * 1000).unref();

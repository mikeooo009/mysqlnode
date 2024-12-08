const redisClient = require('../redisClient');

module.exports = async function(req, res, next) {
  const userId = req.user?.id || req.query.userId || 'guest';
  const key = `rate_limit_user_${userId}`;
  const currentCount = await redisClient.incr(key);

  if (currentCount === 1) {
    // Set 1 second TTL
    await redisClient.expire(key, 1);
  }
  
  if (currentCount > 1) {
    return res.status(429).json({ error: 'Too Many Requests' });
  }

  next();
};

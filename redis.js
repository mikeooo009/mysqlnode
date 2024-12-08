const redis = require('redis');
const client = redis.createClient({ url: 'redis://127.0.0.1:6379' });

client.on('error', (err) => console.error('Redis error:', err.message));

(async () => {
    try {
        await client.connect();
        console.log('Connected to Redis');
    } catch (err) {
        console.error('Unable to connect to Redis:', err.message);
    }
})();

module.exports = client;

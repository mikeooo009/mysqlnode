const Queue = require('bull');

// Initialize the notification queue
const notificationQueue = new Queue('notifications', {
  redis: {
    host: 'localhost',
    port: 6379, // Default Redis port
  },
});

// Export the queue for use in other files
module.exports = { notificationQueue };

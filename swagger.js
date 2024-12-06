const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'User Management API with WebSocket',
      version: '1.0.0',
      description: 'API documentation for managing users with WebSocket and REST endpoints.',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'REST API Server'
      },
      {
        url: 'ws://localhost:8080',
        description: 'WebSocket Server'
      }
    ]
  },
  apis: ['./routes/*.js'], // Path to the API route files
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};

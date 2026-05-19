'use strict';

const express = require('express');
const config = require('./config');
const rateLimitRoutes = require('./modules/rateLimit/rateLimit.routes');
const productRoutes = require('./modules/products/products.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

function buildApp() {
  const app = express();

  // Body parsing. `strict: true` rejects bodies that are not objects/arrays.
  app.use(express.json({ limit: config.jsonBodyLimit, strict: true }));

  // Health
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime_seconds: process.uptime() });
  });

  // Part 1: rate-limited API
  app.use('/', rateLimitRoutes);

  // Part 2: product catalog
  app.use('/', productRoutes);

  // 404 + error middleware (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { buildApp };

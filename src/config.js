'use strict';

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,

  rateLimit: {
    // Rolling 1-minute window, max 5 accepted requests per user_id.
    windowMs: 60 * 1000,
    maxAccepted: 5,
  },

  products: {
    pagination: {
      defaultLimit: 20,
      maxLimit: 100,
    },
    validation: {
      maxUrlLength: 2048,
      maxUrlsPerArrayPerRequest: 20,
      maxNameLength: 255,
      maxSkuLength: 64,
    },
  },

  jsonBodyLimit: '1mb',
};

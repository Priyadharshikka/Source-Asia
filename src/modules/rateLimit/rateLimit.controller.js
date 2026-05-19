'use strict';

const service = require('./rateLimit.service');

async function postRequest(req, res) {
  const result = service.handleRequest(req.body);
  res.status(201).json(result);
}

async function getStats(req, res) {
  const userId = typeof req.query.user_id === 'string' && req.query.user_id.trim().length > 0
    ? req.query.user_id.trim()
    : undefined;
  const stats = service.getStats(userId);
  res.status(200).json(stats);
}

module.exports = { postRequest, getStats };

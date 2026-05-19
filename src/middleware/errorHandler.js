'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Centralised error handler.
 * - ApiError instances → their status/code/message.
 * - express.json body-parser errors (SyntaxError with .type === 'entity.parse.failed')
 *   → 400 Bad Request.
 * - Anything else → 500 Internal Server Error (details hidden from client).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    const body = {
      error: { code: err.code, message: err.message },
    };
    if (err.details !== undefined) body.error.details = err.details;
    return res.status(err.status).json(body);
  }

  // express.json throws SyntaxError on malformed JSON.
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({
      error: { code: 'bad_request', message: 'Invalid JSON body' },
    });
  }

  // Payload too large
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'payload_too_large', message: 'Request body is too large' },
    });
  }

  // Unexpected
  // eslint-disable-next-line no-console
  console.error('[unhandled]', err);
  return res.status(500).json({
    error: { code: 'internal_error', message: 'Internal server error' },
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'not_found', message: `Route ${req.method} ${req.originalUrl} not found` },
  });
}

module.exports = { errorHandler, notFoundHandler };

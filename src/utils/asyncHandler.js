'use strict';

/**
 * Wraps an async route handler so thrown errors / rejected promises
 * are forwarded to Express' error middleware.
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

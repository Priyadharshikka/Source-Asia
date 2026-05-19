'use strict';

/**
 * Domain error carrying an HTTP status code and a machine-readable code.
 * Thrown by services/validators; converted to JSON by the error middleware.
 */
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, 'bad_request', message, details);
  }

  static notFound(message, details) {
    return new ApiError(404, 'not_found', message, details);
  }

  static conflict(message, details) {
    return new ApiError(409, 'conflict', message, details);
  }

  static tooManyRequests(message, details) {
    return new ApiError(429, 'rate_limited', message, details);
  }
}

module.exports = ApiError;

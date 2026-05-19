'use strict';

const ApiError = require('../../utils/ApiError');
const { store } = require('./rateLimit.store');

const MAX_USER_ID_LENGTH = 128;

function validateRequestBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('Request body must be a JSON object');
  }

  const { user_id: userId, payload } = body;

  if (typeof userId !== 'string') {
    throw ApiError.badRequest('"user_id" is required and must be a string');
  }
  const trimmed = userId.trim();
  if (trimmed.length === 0) {
    throw ApiError.badRequest('"user_id" must be a non-empty string');
  }
  if (trimmed.length > MAX_USER_ID_LENGTH) {
    throw ApiError.badRequest(`"user_id" exceeds ${MAX_USER_ID_LENGTH} chars`);
  }
  if (!('payload' in body)) {
    throw ApiError.badRequest('"payload" is required');
  }

  return { userId: trimmed, payload };
}

function handleRequest(body) {
  const { userId, payload } = validateRequestBody(body);
  const result = store.tryAccept(userId);

  if (!result.accepted) {
    const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
    const err = ApiError.tooManyRequests(
      `Rate limit exceeded: max ${store.maxAccepted} requests per ${store.windowMs / 1000}s per user_id`,
      {
        user_id: userId,
        retry_after_ms: result.retryAfterMs,
        retry_after_seconds: retryAfterSec,
        accepted_in_current_window: result.acceptedInWindow,
        max_accepted_per_window: store.maxAccepted,
      },
    );
    err.retryAfterSec = retryAfterSec;
    throw err;
  }

  return {
    user_id: userId,
    accepted: true,
    accepted_in_current_window: result.acceptedInWindow,
    max_accepted_per_window: store.maxAccepted,
    window_ms: store.windowMs,
    // Echo back the payload size only (avoid logging the user's payload).
    payload_received: payload !== undefined,
  };
}

function getStats(userId) {
  return store.getStats(userId);
}

module.exports = { handleRequest, getStats };

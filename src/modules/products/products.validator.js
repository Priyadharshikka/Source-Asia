'use strict';

const ApiError = require('../../utils/ApiError');
const config = require('../../config');

const {
  maxUrlLength,
  maxUrlsPerArrayPerRequest,
  maxNameLength,
  maxSkuLength,
} = config.products.validation;

function assertObject(body, where) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest(`${where} must be a JSON object`);
  }
}

function validateUrlString(value, fieldName, index) {
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`${fieldName}[${index}] must be a string`);
  }
  if (value.length === 0) {
    throw ApiError.badRequest(`${fieldName}[${index}] must be non-empty`);
  }
  if (value.length > maxUrlLength) {
    throw ApiError.badRequest(`${fieldName}[${index}] exceeds max length ${maxUrlLength}`);
  }
  // Cheap protocol check first.
  if (!/^https?:\/\//i.test(value)) {
    throw ApiError.badRequest(`${fieldName}[${index}] must start with http:// or https://`);
  }
  // Use WHATWG URL parser for structural validity.
  try {
    // eslint-disable-next-line no-new
    new URL(value);
  } catch {
    throw ApiError.badRequest(`${fieldName}[${index}] is not a valid URL`);
  }
}

function validateUrlArray(value, fieldName) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw ApiError.badRequest(`"${fieldName}" must be an array of URL strings`);
  }
  if (value.length > maxUrlsPerArrayPerRequest) {
    throw ApiError.badRequest(
      `"${fieldName}" exceeds max ${maxUrlsPerArrayPerRequest} URLs per request`,
    );
  }
  value.forEach((url, i) => validateUrlString(url, fieldName, i));
  return value.slice();
}

function validateNonEmptyString(value, fieldName, maxLen) {
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`"${fieldName}" is required and must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw ApiError.badRequest(`"${fieldName}" must be non-empty`);
  }
  if (trimmed.length > maxLen) {
    throw ApiError.badRequest(`"${fieldName}" exceeds max length ${maxLen}`);
  }
  return trimmed;
}

function validateCreateProduct(body) {
  assertObject(body, 'Request body');
  const name = validateNonEmptyString(body.name, 'name', maxNameLength);
  const sku = validateNonEmptyString(body.sku, 'sku', maxSkuLength);
  const imageUrls = validateUrlArray(body.image_urls, 'image_urls');
  const videoUrls = validateUrlArray(body.video_urls, 'video_urls');
  return { name, sku, imageUrls, videoUrls };
}

function validateAppendMedia(body) {
  assertObject(body, 'Request body');
  const hasImages = body.image_urls !== undefined && body.image_urls !== null;
  const hasVideos = body.video_urls !== undefined && body.video_urls !== null;
  if (!hasImages && !hasVideos) {
    throw ApiError.badRequest('At least one of "image_urls" or "video_urls" is required');
  }
  const imageUrls = validateUrlArray(body.image_urls, 'image_urls');
  const videoUrls = validateUrlArray(body.video_urls, 'video_urls');
  if (imageUrls.length === 0 && videoUrls.length === 0) {
    throw ApiError.badRequest('At least one URL must be provided');
  }
  return { imageUrls, videoUrls };
}

function parsePagination(query) {
  const { defaultLimit, maxLimit } = config.products.pagination;
  let limit = defaultLimit;
  let offset = 0;

  if (query.limit !== undefined) {
    const n = Number(query.limit);
    if (!Number.isInteger(n) || n < 1 || n > maxLimit) {
      throw ApiError.badRequest(`"limit" must be an integer between 1 and ${maxLimit}`);
    }
    limit = n;
  }
  if (query.offset !== undefined) {
    const n = Number(query.offset);
    if (!Number.isInteger(n) || n < 0) {
      throw ApiError.badRequest('"offset" must be a non-negative integer');
    }
    offset = n;
  }
  return { limit, offset };
}

module.exports = {
  validateCreateProduct,
  validateAppendMedia,
  parsePagination,
};

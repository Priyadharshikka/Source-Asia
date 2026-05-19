'use strict';

const ApiError = require('../../utils/ApiError');
const { store } = require('./products.store');
const validator = require('./products.validator');

function createProduct(body) {
  const input = validator.validateCreateProduct(body);
  if (store.hasSku(input.sku)) {
    throw ApiError.conflict(`sku "${input.sku}" already exists`);
  }
  const result = store.create(input);
  if (result.conflict) {
    // Race we can't actually hit in single-threaded Node, but kept for safety.
    throw ApiError.conflict(`sku "${input.sku}" already exists`);
  }
  return result.summary; // Summary already contains everything except URL arrays.
}

function listProducts(query) {
  const { limit, offset } = validator.parsePagination(query);
  const { items, total } = store.list({ limit, offset });
  return {
    items,
    pagination: {
      limit,
      offset,
      total,
      returned: items.length,
      has_more: offset + items.length < total,
    },
  };
}

function getProduct(id) {
  const product = store.getById(id);
  if (!product) {
    throw ApiError.notFound(`product "${id}" not found`);
  }
  return product;
}

function appendMedia(id, body) {
  const input = validator.validateAppendMedia(body);
  const updated = store.appendMedia(id, input);
  if (!updated) {
    throw ApiError.notFound(`product "${id}" not found`);
  }
  return updated;
}

module.exports = {
  createProduct,
  listProducts,
  getProduct,
  appendMedia,
};

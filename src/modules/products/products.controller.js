'use strict';

const service = require('./products.service');

async function create(req, res) {
  const product = service.createProduct(req.body);
  res.status(201).json(product);
}

async function list(req, res) {
  const result = service.listProducts(req.query);
  res.status(200).json(result);
}

async function getOne(req, res) {
  const product = service.getProduct(req.params.id);
  res.status(200).json(product);
}

async function addMedia(req, res) {
  const product = service.appendMedia(req.params.id, req.body);
  res.status(200).json(product);
}

module.exports = { create, list, getOne, addMedia };

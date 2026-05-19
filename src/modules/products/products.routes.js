'use strict';

const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const controller = require('./products.controller');

const router = Router();

router.post('/products', asyncHandler(controller.create));
router.get('/products', asyncHandler(controller.list));
router.get('/products/:id', asyncHandler(controller.getOne));
router.post('/products/:id/media', asyncHandler(controller.addMedia));

module.exports = router;

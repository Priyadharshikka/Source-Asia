'use strict';

const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const controller = require('./rateLimit.controller');

const router = Router();

router.post('/request', asyncHandler(controller.postRequest));
router.get('/stats', asyncHandler(controller.getStats));

module.exports = router;

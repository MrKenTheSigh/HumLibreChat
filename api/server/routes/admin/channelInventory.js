const express = require('express');
const { requireAdmin, createGetAdminChannelInventory } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const { getAppConfig, getEndpointsConfig } = require('~/server/services/Config');
const { getModelsConfig } = require('~/server/controllers/ModelController');

const router = express.Router();

router.use(requireJwtAuth, requireAdmin);

router.get(
  '/',
  createGetAdminChannelInventory({
    getAppConfig,
    getEndpointsConfig,
    getModelsConfig,
  }),
);

module.exports = router;

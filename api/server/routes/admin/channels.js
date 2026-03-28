const express = require('express');
const { requireAdmin, createAdminChannelsHandlers } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const { getAppConfig, getEndpointsConfig, clearRuntimeConfigCaches } = require('~/server/services/Config');
const { getModelsConfig } = require('~/server/controllers/ModelController');

const router = express.Router();

router.use(requireJwtAuth, requireAdmin);

const handlers = createAdminChannelsHandlers({
  getAppConfig,
  getEndpointsConfig,
  getModelsConfig,
  refreshRuntimeConfig: clearRuntimeConfigCaches,
});

router.get('/', handlers.getAdminChannels);
router.get('/:channelId', handlers.getAdminChannel);
router.post('/', handlers.createAdminChannel);
router.patch('/:channelId', handlers.updateAdminChannel);
router.delete('/:channelId', handlers.deleteAdminChannel);

module.exports = router;

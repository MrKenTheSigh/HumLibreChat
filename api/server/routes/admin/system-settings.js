const express = require('express');
const { requireAdmin, createAdminSystemSettingsHandlers } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const { clearRuntimeConfigCaches } = require('~/server/services/Config');

const router = express.Router();

router.use(requireJwtAuth, requireAdmin);

const handlers = createAdminSystemSettingsHandlers({
  refreshRuntimeConfig: clearRuntimeConfigCaches,
});

router.get('/', handlers.getAdminSystemSettings);
router.patch('/memory', handlers.updateAdminMemorySystemSetting);
router.patch('/web-search', handlers.updateAdminWebSearchSystemSetting);
router.patch(
  '/sensitive-information-policy',
  handlers.updateAdminSensitiveInformationPolicySystemSetting,
);

module.exports = router;

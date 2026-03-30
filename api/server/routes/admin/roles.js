const express = require('express');
const { requireAdmin } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');
const { requireJwtAuth } = require('~/server/middleware');
const getLogStores = require('~/cache/getLogStores');
const {
  createAdminRole,
  deleteAdminRole,
  getAdminRole,
  getAdminRoles,
  updateAdminRole,
} = require('@librechat/api');

const router = express.Router();

router.use(requireJwtAuth, requireAdmin);

const clearRoleCache = async (roleName) => {
  if (!roleName) {
    return;
  }

  const cache = getLogStores(CacheKeys.ROLES);
  await cache.delete(roleName.trim().toUpperCase());
};

router.get('/', getAdminRoles);
router.post('/', createAdminRole);
router.get('/:roleName', getAdminRole);
router.patch('/:roleName', async (req, res, next) => {
  await updateAdminRole(req, res, next);
  if (res.headersSent && res.statusCode < 400) {
    await clearRoleCache(req.params.roleName);
  }
});
router.delete('/:roleName', async (req, res, next) => {
  await deleteAdminRole(req, res, next);
  if (res.headersSent && res.statusCode < 400) {
    await clearRoleCache(req.params.roleName);
  }
});

module.exports = router;

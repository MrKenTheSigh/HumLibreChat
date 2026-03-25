const express = require('express');
const { requireAdmin } = require('@librechat/api');
const {
  requireJwtAuth,
} = require('~/server/middleware');
const {
  getAdminUsers,
  getAdminUser,
  addAdminUserBalance,
  setAdminUserBalance,
} = require('@librechat/api');

const router = express.Router();

router.use(requireJwtAuth, requireAdmin);

router.get('/', getAdminUsers);
router.get('/:userId', getAdminUser);
router.post('/:userId/balance/add', addAdminUserBalance);
router.post('/:userId/balance/set', setAdminUserBalance);

module.exports = router;

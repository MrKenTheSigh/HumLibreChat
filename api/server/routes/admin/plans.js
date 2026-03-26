const express = require('express');
const { requireAdmin } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const {
  createAdminPlan,
  deleteAdminPlan,
  getAdminPlan,
  getAdminPlans,
  updateAdminPlan,
} = require('@librechat/api');

const router = express.Router();

router.use(requireJwtAuth, requireAdmin);

router.get('/', getAdminPlans);
router.get('/:planId', getAdminPlan);
router.post('/', createAdminPlan);
router.patch('/:planId', updateAdminPlan);
router.delete('/:planId', deleteAdminPlan);

module.exports = router;

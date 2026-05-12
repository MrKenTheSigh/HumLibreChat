const express = require('express');
const { requireAdmin, requireAdminDataAccess } = require('@librechat/api');
const {
  requireJwtAuth,
  configMiddleware,
} = require('~/server/middleware');
const {
  createAdminUser,
  getAdminUsers,
  getAdminUser,
  updateAdminUser,
  addAdminUserBalance,
  applyAdminUserPlanStartingCredits,
  assignAdminUserPlan,
  clearAdminUserPlan,
  setAdminUserBalance,
  updateAdminUserDepartment,
  updateAdminUserRole,
} = require('@librechat/api');

const router = express.Router();

router.use(requireJwtAuth);

router.get('/', requireAdminDataAccess, getAdminUsers);
router.post('/', requireAdmin, configMiddleware, createAdminUser);
router.use(requireAdmin);
router.get('/:userId', configMiddleware, getAdminUser);
router.patch('/:userId', updateAdminUser);
router.post('/:userId/balance/add', addAdminUserBalance);
router.post('/:userId/balance/set', setAdminUserBalance);
router.post('/:userId/role', updateAdminUserRole);
router.post('/:userId/department', updateAdminUserDepartment);
router.post('/:userId/plan', configMiddleware, assignAdminUserPlan);
router.post(
  '/:userId/plan/apply-starting-credits',
  configMiddleware,
  applyAdminUserPlanStartingCredits,
);
router.delete('/:userId/plan', clearAdminUserPlan);

module.exports = router;

const express = require('express');
const { requireAdmin } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const {
  activateAdminQuotaPeriod,
  approveAdminQuotaGrantRequest,
  closeAdminQuotaPeriod,
  createAdminQuotaAllocation,
  createAdminQuotaGrant,
  createAdminQuotaGrantRequest,
  createAdminQuotaPeriod,
  getAdminQuotaAccounts,
  getAdminQuotaGrants,
  getAdminQuotaLedger,
  getAdminQuotaPeriods,
  rejectAdminQuotaGrantRequest,
} = require('@librechat/api');

const router = express.Router();

router.use(requireJwtAuth, requireAdmin);

router.get('/periods', getAdminQuotaPeriods);
router.post('/periods', createAdminQuotaPeriod);
router.post('/periods/:periodId/activate', activateAdminQuotaPeriod);
router.post('/periods/:periodId/close', closeAdminQuotaPeriod);
router.get('/accounts', getAdminQuotaAccounts);
router.post('/allocations', createAdminQuotaAllocation);
router.get('/grants', getAdminQuotaGrants);
router.post('/grants', createAdminQuotaGrant);
router.post('/grants/requests', createAdminQuotaGrantRequest);
router.post('/grants/:grantId/approve', approveAdminQuotaGrantRequest);
router.post('/grants/:grantId/reject', rejectAdminQuotaGrantRequest);
router.get('/ledger', getAdminQuotaLedger);

module.exports = router;

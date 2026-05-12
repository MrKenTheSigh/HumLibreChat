const express = require('express');
const { requireAdmin, requireAdminDataAccess } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const {
  activateAdminQuotaPeriod,
  approveAdminQuotaGrantRequest,
  closeAdminQuotaPeriod,
  createAdminQuotaAllocation,
  createAdminQuotaGrant,
  createAdminQuotaGrantRequest,
  createAdminQuotaPeriod,
  createAdminQuotaRequest,
  getAdminQuotaAccounts,
  getAdminQuotaGrants,
  getAdminQuotaLedger,
  getAdminQuotaPeriods,
  getAdminQuotaRequests,
  approveAdminQuotaRequest,
  rejectAdminQuotaGrantRequest,
  rejectAdminQuotaRequest,
} = require('@librechat/api');

const router = express.Router();

router.use(requireJwtAuth);

router.get('/periods', requireAdminDataAccess, getAdminQuotaPeriods);
router.post('/periods', requireAdmin, createAdminQuotaPeriod);
router.post('/periods/:periodId/activate', requireAdmin, activateAdminQuotaPeriod);
router.post('/periods/:periodId/close', requireAdmin, closeAdminQuotaPeriod);
router.get('/accounts', requireAdminDataAccess, getAdminQuotaAccounts);
router.post('/allocations', requireAdminDataAccess, createAdminQuotaAllocation);
router.get('/grants', requireAdmin, getAdminQuotaGrants);
router.post('/grants', requireAdmin, createAdminQuotaGrant);
router.post('/grants/requests', requireAdmin, createAdminQuotaGrantRequest);
router.post('/grants/:grantId/approve', requireAdmin, approveAdminQuotaGrantRequest);
router.post('/grants/:grantId/reject', requireAdmin, rejectAdminQuotaGrantRequest);
router.get('/requests', requireAdminDataAccess, getAdminQuotaRequests);
router.post('/requests', requireAdminDataAccess, createAdminQuotaRequest);
router.post('/requests/:requestId/approve', requireAdminDataAccess, approveAdminQuotaRequest);
router.post('/requests/:requestId/reject', requireAdminDataAccess, rejectAdminQuotaRequest);
router.get('/ledger', requireAdminDataAccess, getAdminQuotaLedger);

module.exports = router;

const express = require('express');
const {
  requireAdminDataAccess,
  exportAdminTransactionsCsv,
  exportAdminUsageMembersCsv,
  getAdminTransactionsExportCount,
  getAdminUsageMembers,
  getAdminUsageMembersExportCount,
  getAdminTransactions,
  getAdminUsageSummary,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth, requireAdminDataAccess);

router.get('/members/export/count', getAdminUsageMembersExportCount);
router.get('/members/export', exportAdminUsageMembersCsv);
router.get('/members', getAdminUsageMembers);
router.get('/summary', getAdminUsageSummary);
router.get('/transactions/export/count', getAdminTransactionsExportCount);
router.get('/transactions/export', exportAdminTransactionsCsv);
router.get('/transactions', getAdminTransactions);

module.exports = router;

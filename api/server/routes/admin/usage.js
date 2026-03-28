const express = require('express');
const { requireAdmin, getAdminTransactions, getAdminUsageSummary } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth, requireAdmin);

router.get('/summary', getAdminUsageSummary);
router.get('/transactions', getAdminTransactions);

module.exports = router;

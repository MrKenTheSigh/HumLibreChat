const express = require('express');
const {
  getAdminSensitiveInformationMessages,
  getAdminSensitiveInformationSummary,
  requireAdminDataAccess,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth, requireAdminDataAccess);

router.get('/summary', getAdminSensitiveInformationSummary);
router.get('/messages', getAdminSensitiveInformationMessages);

module.exports = router;

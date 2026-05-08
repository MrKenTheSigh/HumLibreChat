const express = require('express');
const { getAdminActivityLogs, requireAdminDataAccess } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth, requireAdminDataAccess);

router.get('/', getAdminActivityLogs);

module.exports = router;

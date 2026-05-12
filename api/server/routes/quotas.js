const express = require('express');
const { createUserQuotaRequest, getUserQuotaRequests } = require('@librechat/api');
const { requireJwtAuth } = require('../middleware/');

const router = express.Router();

router.use(requireJwtAuth);

router.get('/requests', getUserQuotaRequests);
router.post('/requests', createUserQuotaRequest);

module.exports = router;

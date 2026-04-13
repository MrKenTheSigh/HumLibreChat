const express = require('express');
const router = express.Router();
const controller = require('../controllers/Balance');
const { requireJwtAuth, configMiddleware } = require('../middleware/');

router.get('/', requireJwtAuth, configMiddleware, controller);

module.exports = router;

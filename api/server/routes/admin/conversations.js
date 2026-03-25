const express = require('express');
const { requireAdmin } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const {
  getAdminConversations,
  getAdminConversation,
  getAdminConversationMessages,
} = require('@librechat/api');

const router = express.Router();

router.use(requireJwtAuth, requireAdmin);

router.get('/', getAdminConversations);
router.get('/:conversationId/messages', getAdminConversationMessages);
router.get('/:conversationId', getAdminConversation);

module.exports = router;

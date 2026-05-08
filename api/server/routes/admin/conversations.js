const express = require('express');
const { requireAdminDataAccess } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const {
  getAdminConversations,
  getAdminConversation,
  getAdminConversationMessages,
} = require('@librechat/api');

const router = express.Router();

router.use(requireJwtAuth, requireAdminDataAccess);

router.get('/', getAdminConversations);
router.get('/:conversationId/messages', getAdminConversationMessages);
router.get('/:conversationId', getAdminConversation);

module.exports = router;

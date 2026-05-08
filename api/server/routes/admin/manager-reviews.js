const express = require('express');
const {
  createManagerReviewBatch,
  getManagerReviewBatches,
  getManagerReviewBatchItems,
  previewManagerReviewBatchEmail,
  requireAdmin,
  scanOverdueManagerReviewBatches,
  sendManagerReviewBatchEmail,
  sendManagerReviewBatchReminderEmail,
  submitManagerReviewBatchResponse,
} = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth, requireAdmin);

router.get('/batches', getManagerReviewBatches);
router.post('/batches', createManagerReviewBatch);
router.post('/batches/overdue/scan', scanOverdueManagerReviewBatches);
router.get('/batches/:batchId/items', getManagerReviewBatchItems);
router.post('/batches/:batchId/email/preview', previewManagerReviewBatchEmail);
router.post('/batches/:batchId/email/send', sendManagerReviewBatchEmail);
router.post('/batches/:batchId/reminder/email/send', sendManagerReviewBatchReminderEmail);
router.post('/batches/:batchId/response', submitManagerReviewBatchResponse);

module.exports = router;

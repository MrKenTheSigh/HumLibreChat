const express = require('express');
const {
  getManagerReviewBatchByToken,
  getManagerReviewBatchItemsByToken,
  submitManagerReviewBatchResponseByToken,
} = require('@librechat/api');

const router = express.Router();

router.get('/batches/:batchId', getManagerReviewBatchByToken);
router.get('/batches/:batchId/items', getManagerReviewBatchItemsByToken);
router.post('/batches/:batchId/response', submitManagerReviewBatchResponseByToken);

module.exports = router;

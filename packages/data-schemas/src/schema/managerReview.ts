import { Schema } from 'mongoose';
import type { IManagerReviewBatch, IManagerReviewItem } from '~/types';

const managerReviewBatchSchema = new Schema<IManagerReviewBatch>(
  {
    batchKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    managerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    cadence: {
      type: String,
      enum: ['daily', 'weekly'],
      required: true,
      default: 'daily',
      index: true,
    },
    periodStart: {
      type: Date,
      required: true,
      index: true,
    },
    periodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['generated', 'sent', 'reviewed', 'overdue', 'cancelled'],
      required: true,
      default: 'generated',
      index: true,
    },
    replyTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    itemCount: {
      type: Number,
      default: 0,
    },
    transactionCount: {
      type: Number,
      default: 0,
    },
    totalTokenValue: {
      type: Number,
      default: 0,
    },
    totalRawAmount: {
      type: Number,
      default: 0,
    },
    totalInputTokens: {
      type: Number,
      default: 0,
    },
    totalWriteTokens: {
      type: Number,
      default: 0,
    },
    totalReadTokens: {
      type: Number,
      default: 0,
    },
    quotaPeriodId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaPeriod',
      default: null,
      index: true,
    },
    quotaAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaAccount',
      default: null,
      index: true,
    },
    quotaAllocatedCredits: {
      type: Number,
      default: 0,
    },
    quotaExtraGrantedCredits: {
      type: Number,
      default: 0,
    },
    quotaUsedCredits: {
      type: Number,
      default: 0,
    },
    quotaRemainingCredits: {
      type: Number,
      default: 0,
    },
    quotaBufferCredits: {
      type: Number,
      default: 0,
    },
    quotaWarningCount: {
      type: Number,
      default: 0,
    },
    quotaBlockCount: {
      type: Number,
      default: 0,
    },
    emailTo: {
      type: String,
      default: '',
      trim: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    reminderSentAt: {
      type: Date,
      default: null,
    },
    dueAt: {
      type: Date,
      default: null,
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    responseStatus: {
      type: String,
      enum: ['ok', 'not_ok', null],
      default: null,
      index: true,
    },
    responseText: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

managerReviewBatchSchema.index({ managerUserId: 1, status: 1, dueAt: 1 });
managerReviewBatchSchema.index({ departmentId: 1, periodStart: -1, periodEnd: -1 });

const managerReviewItemSchema = new Schema<IManagerReviewItem>(
  {
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'ManagerReviewBatch',
      required: true,
      index: true,
    },
    managerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'ok', 'not_ok'],
      required: true,
      default: 'pending',
      index: true,
    },
    riskLevel: {
      type: String,
      enum: ['normal', 'attention', 'high'],
      required: true,
      default: 'normal',
      index: true,
    },
    replyTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    transactionCount: {
      type: Number,
      default: 0,
    },
    totalTokenValue: {
      type: Number,
      default: 0,
    },
    totalRawAmount: {
      type: Number,
      default: 0,
    },
    totalInputTokens: {
      type: Number,
      default: 0,
    },
    totalWriteTokens: {
      type: Number,
      default: 0,
    },
    totalReadTokens: {
      type: Number,
      default: 0,
    },
    quotaAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaAccount',
      default: null,
      index: true,
    },
    quotaAllocatedCredits: {
      type: Number,
      default: 0,
    },
    quotaExtraGrantedCredits: {
      type: Number,
      default: 0,
    },
    quotaUsedCredits: {
      type: Number,
      default: 0,
    },
    quotaRemainingCredits: {
      type: Number,
      default: 0,
    },
    quotaBufferCredits: {
      type: Number,
      default: 0,
    },
    quotaWarningCount: {
      type: Number,
      default: 0,
    },
    quotaBlockCount: {
      type: Number,
      default: 0,
    },
    newestTransactionAt: {
      type: Date,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    responseText: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

managerReviewItemSchema.index({ batchId: 1, status: 1 });
managerReviewItemSchema.index({ managerUserId: 1, status: 1, createdAt: -1 });

export { managerReviewBatchSchema, managerReviewItemSchema };

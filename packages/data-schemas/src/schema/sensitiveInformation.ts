import { Schema } from 'mongoose';
import type { ISensitiveInformationDailySummary } from '~/types';

const sensitiveInformationDailySummarySchema = new Schema<ISensitiveInformationDailySummary>(
  {
    dateKey: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
      index: true,
    },
    ruleCode: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    totalCount: {
      type: Number,
      required: true,
      default: 0,
    },
    submittedCount: {
      type: Number,
      required: true,
      default: 0,
    },
    blockedCount: {
      type: Number,
      required: true,
      default: 0,
    },
    messageCount: {
      type: Number,
      required: true,
      default: 0,
    },
    submittedMessageCount: {
      type: Number,
      required: true,
      default: 0,
    },
    blockedMessageCount: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true },
);

sensitiveInformationDailySummarySchema.index(
  { dateKey: 1, userId: 1, ruleCode: 1 },
  { unique: true },
);
sensitiveInformationDailySummarySchema.index({ userId: 1, ruleCode: 1, dateKey: -1 });
sensitiveInformationDailySummarySchema.index({ departmentId: 1, dateKey: -1 });

export default sensitiveInformationDailySummarySchema;

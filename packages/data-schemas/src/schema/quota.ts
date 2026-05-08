import { Schema } from 'mongoose';
import type {
  IQuotaAccount,
  IQuotaAllocation,
  IQuotaGrant,
  IQuotaLedgerEntry,
  IQuotaPeriod,
} from '~/types';

const quotaPeriodSchema = new Schema<IQuotaPeriod>(
  {
    periodKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    timezone: {
      type: String,
      required: true,
      default: 'UTC',
      trim: true,
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
      enum: ['draft', 'active', 'closed'],
      required: true,
      default: 'draft',
      index: true,
    },
    closePolicy: {
      billingDay: {
        type: Number,
        min: 1,
        max: 31,
        default: null,
      },
    },
  },
  { timestamps: true },
);

quotaPeriodSchema.index({ status: 1, periodStart: -1 });

const quotaAccountSchema = new Schema<IQuotaAccount>(
  {
    periodId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaPeriod',
      required: true,
      index: true,
    },
    scopeType: {
      type: String,
      enum: ['company', 'department', 'user'],
      required: true,
      index: true,
    },
    scopeId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    parentAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaAccount',
      default: null,
      index: true,
    },
    baseAllocatedCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
    extraGrantedCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
    usedCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
    reservedCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
    warningThresholds: {
      type: [Number],
      default: [0.8, 0.9, 1],
    },
    hardLimitEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    bufferCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

quotaAccountSchema.index({ periodId: 1, scopeType: 1, scopeId: 1 }, { unique: true });
quotaAccountSchema.index({ periodId: 1, parentAccountId: 1 });

const quotaLedgerEntrySchema = new Schema<IQuotaLedgerEntry>(
  {
    periodId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaPeriod',
      required: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaAccount',
      required: true,
      index: true,
    },
    counterpartyAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaAccount',
      default: null,
      index: true,
    },
    entryType: {
      type: String,
      enum: ['allocation', 'grant', 'usage', 'refund', 'adjustment', 'warning', 'block'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    sourceType: {
      type: String,
      enum: ['transaction', 'admin_action', 'manager_action', 'system'],
      required: true,
      index: true,
    },
    sourceId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

quotaLedgerEntrySchema.index({ accountId: 1, createdAt: -1 });
quotaLedgerEntrySchema.index({ periodId: 1, entryType: 1, createdAt: -1 });

const quotaAllocationSchema = new Schema<IQuotaAllocation>(
  {
    periodId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaPeriod',
      required: true,
      index: true,
    },
    fromAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaAccount',
      required: true,
      index: true,
    },
    toAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaAccount',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'replaced', 'cancelled'],
      required: true,
      default: 'active',
      index: true,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

quotaAllocationSchema.index({ periodId: 1, fromAccountId: 1, status: 1 });
quotaAllocationSchema.index({ periodId: 1, toAccountId: 1, status: 1 });

const quotaGrantSchema = new Schema<IQuotaGrant>(
  {
    periodId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaPeriod',
      required: true,
      index: true,
    },
    targetAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'QuotaAccount',
      required: true,
      index: true,
    },
    requestedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    approvedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['requested', 'approved', 'rejected', 'cancelled'],
      required: true,
      default: 'requested',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

quotaGrantSchema.index({ periodId: 1, targetAccountId: 1, status: 1 });

export {
  quotaAccountSchema,
  quotaAllocationSchema,
  quotaGrantSchema,
  quotaLedgerEntrySchema,
  quotaPeriodSchema,
};

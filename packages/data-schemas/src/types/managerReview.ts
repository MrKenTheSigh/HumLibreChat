import type { Document, Types } from 'mongoose';

export type ManagerReviewCadence = 'daily' | 'weekly';
export type ManagerReviewBatchStatus =
  | 'generated'
  | 'sent'
  | 'reviewed'
  | 'overdue'
  | 'cancelled';
export type ManagerReviewItemStatus = 'pending' | 'ok' | 'not_ok';
export type ManagerReviewResponseStatus = 'ok' | 'not_ok' | null;
export type ManagerReviewRiskLevel = 'normal' | 'attention' | 'high';

export interface IManagerReviewBatch extends Document {
  batchKey: string;
  managerUserId: Types.ObjectId;
  departmentId: Types.ObjectId;
  cadence: ManagerReviewCadence;
  periodStart: Date;
  periodEnd: Date;
  status: ManagerReviewBatchStatus;
  replyTokenHash: string;
  itemCount: number;
  transactionCount: number;
  totalTokenValue: number;
  totalRawAmount: number;
  totalInputTokens: number;
  totalWriteTokens: number;
  totalReadTokens: number;
  quotaPeriodId?: Types.ObjectId | null;
  quotaAccountId?: Types.ObjectId | null;
  quotaAllocatedCredits: number;
  quotaExtraGrantedCredits: number;
  quotaUsedCredits: number;
  quotaRemainingCredits: number;
  quotaBufferCredits: number;
  quotaWarningCount: number;
  quotaBlockCount: number;
  emailTo?: string;
  sentAt?: Date | null;
  reminderSentAt?: Date | null;
  dueAt?: Date | null;
  reviewedAt?: Date | null;
  responseStatus?: ManagerReviewResponseStatus;
  responseText?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IManagerReviewItem extends Document {
  batchId: Types.ObjectId;
  managerUserId: Types.ObjectId;
  departmentId: Types.ObjectId;
  userId: Types.ObjectId;
  conversationId?: string | null;
  status: ManagerReviewItemStatus;
  riskLevel: ManagerReviewRiskLevel;
  replyTokenHash: string;
  transactionCount: number;
  totalTokenValue: number;
  totalRawAmount: number;
  totalInputTokens: number;
  totalWriteTokens: number;
  totalReadTokens: number;
  quotaAccountId?: Types.ObjectId | null;
  quotaAllocatedCredits: number;
  quotaExtraGrantedCredits: number;
  quotaUsedCredits: number;
  quotaRemainingCredits: number;
  quotaBufferCredits: number;
  quotaWarningCount: number;
  quotaBlockCount: number;
  newestTransactionAt?: Date | null;
  reviewedAt?: Date | null;
  responseText?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

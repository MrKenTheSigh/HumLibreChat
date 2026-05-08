import type { Document, Types } from 'mongoose';

export type QuotaPeriodStatus = 'draft' | 'active' | 'closed';
export type QuotaAccountScopeType = 'company' | 'department' | 'user';
export type QuotaLedgerEntryType =
  | 'allocation'
  | 'grant'
  | 'usage'
  | 'refund'
  | 'adjustment'
  | 'warning'
  | 'block';
export type QuotaLedgerSourceType = 'transaction' | 'admin_action' | 'manager_action' | 'system';
export type QuotaAllocationStatus = 'active' | 'replaced' | 'cancelled';
export type QuotaGrantStatus = 'requested' | 'approved' | 'rejected' | 'cancelled';

export interface IQuotaPeriod extends Document {
  periodKey: string;
  timezone: string;
  periodStart: Date;
  periodEnd: Date;
  status: QuotaPeriodStatus;
  closePolicy?: {
    billingDay?: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IQuotaAccount extends Document {
  periodId: Types.ObjectId;
  scopeType: QuotaAccountScopeType;
  scopeId?: string | null;
  parentAccountId?: Types.ObjectId | null;
  baseAllocatedCredits: number;
  extraGrantedCredits: number;
  usedCredits: number;
  reservedCredits: number;
  remainingCredits: number;
  warningThresholds: number[];
  hardLimitEnabled: boolean;
  bufferCredits: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IQuotaLedgerEntry extends Document {
  periodId: Types.ObjectId;
  accountId: Types.ObjectId;
  counterpartyAccountId?: Types.ObjectId | null;
  entryType: QuotaLedgerEntryType;
  amount: number;
  balanceAfter: number;
  sourceType: QuotaLedgerSourceType;
  sourceId?: string | null;
  reason?: string;
  actorUserId?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IQuotaAllocation extends Document {
  periodId: Types.ObjectId;
  fromAccountId: Types.ObjectId;
  toAccountId: Types.ObjectId;
  amount: number;
  status: QuotaAllocationStatus;
  reason?: string;
  actorUserId?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IQuotaGrant extends Document {
  periodId: Types.ObjectId;
  targetAccountId: Types.ObjectId;
  requestedByUserId?: Types.ObjectId | null;
  approvedByUserId?: Types.ObjectId | null;
  amount: number;
  reason: string;
  status: QuotaGrantStatus;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

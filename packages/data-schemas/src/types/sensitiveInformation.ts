import type { Document, Types } from 'mongoose';

export type SensitiveInformationOutcome = 'submitted' | 'blocked';

export interface ISensitiveInformationDailySummary extends Document {
  dateKey: string;
  userId: string;
  departmentId?: Types.ObjectId | null;
  ruleCode: string;
  label: string;
  totalCount: number;
  submittedCount: number;
  blockedCount: number;
  messageCount: number;
  submittedMessageCount: number;
  blockedMessageCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

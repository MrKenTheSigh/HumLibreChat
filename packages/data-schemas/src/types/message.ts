import type { Document } from 'mongoose';
import type { TFeedbackRating, TFeedbackTag } from 'librechat-data-provider';

export type SensitiveDetectionRuleMatch = {
  ruleCode: string;
  label: string;
  count: number;
};

export type SensitiveDetection = {
  version: number;
  totalCount: number;
  ruleMatches: SensitiveDetectionRuleMatch[];
  evaluatedAt: Date;
  source?: string;
};

// @ts-ignore
export interface IMessage extends Document {
  messageId: string;
  conversationId: string;
  user: string;
  creditUsage?: {
    spentCredits: number;
    status: 'final' | 'estimated' | 'unavailable';
  };
  sensitiveDetection?: SensitiveDetection;
  model?: string;
  endpoint?: string;
  conversationSignature?: string;
  clientId?: string;
  invocationId?: number;
  parentMessageId?: string;
  tokenCount?: number;
  summaryTokenCount?: number;
  sender?: string;
  text?: string;
  summary?: string;
  isCreatedByUser: boolean;
  unfinished?: boolean;
  error?: boolean;
  finish_reason?: string;
  feedback?: {
    rating: TFeedbackRating;
    tag: TFeedbackTag | undefined;
    text?: string;
  };
  _meiliIndex?: boolean;
  files?: unknown[];
  plugin?: {
    latest?: string;
    inputs?: unknown[];
    outputs?: string;
  };
  plugins?: unknown[];
  content?: unknown[];
  thread_id?: string;
  iconURL?: string;
  addedConvo?: boolean;
  metadata?: Record<string, unknown>;
  attachments?: unknown[];
  expiredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

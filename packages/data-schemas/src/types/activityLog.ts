import type { Document, Types } from 'mongoose';

export type ActivityLogResult = 'success' | 'failure';
export type ActivityLogMetadataValue = string | number | boolean | Date | null;
export type ActivityLogMetadata = Record<string, ActivityLogMetadataValue>;

export interface IActivityLog extends Document {
  eventId: string;
  actorUserId?: Types.ObjectId | string | null;
  actorRole?: string | null;
  actorDepartmentId?: Types.ObjectId | string | null;
  resourceType: string;
  resourceId?: string | null;
  action: string;
  result: ActivityLogResult;
  message?: string;
  metadata?: ActivityLogMetadata;
  requestIp?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

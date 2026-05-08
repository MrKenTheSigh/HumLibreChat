import { Schema, Types } from 'mongoose';
import type { IActivityLog } from '~/types';

const activityLogSchema = new Schema<IActivityLog>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => new Types.ObjectId().toHexString(),
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    actorRole: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    actorDepartmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
      index: true,
    },
    resourceType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    resourceId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    result: {
      type: String,
      enum: ['success', 'failure'],
      required: true,
      index: true,
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    requestIp: {
      type: String,
      default: null,
      trim: true,
    },
    userAgent: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true },
);

activityLogSchema.index({ createdAt: -1, _id: -1 });
activityLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

export default activityLogSchema;

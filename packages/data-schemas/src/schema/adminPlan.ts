import { Schema } from 'mongoose';
import type { IAdminPlan } from '~/types';

const adminPlanModelEntitlementSchema = new Schema(
  {
    channelId: {
      type: String,
      required: true,
      trim: true,
    },
    endpoint: {
      type: String,
      required: true,
      trim: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false },
);

const adminPlanSchema = new Schema<IAdminPlan>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    channelIds: {
      type: [String],
      default: [],
    },
    modelEntitlements: {
      type: [adminPlanModelEntitlementSchema],
      default: [],
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    startingCredits: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  { timestamps: true },
);

export default adminPlanSchema;

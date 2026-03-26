import { Schema } from 'mongoose';
import type { IAdminChannel } from '../types';

const adminChannelEntrySchema = new Schema(
  {
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
    label: {
      type: String,
      required: true,
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    defaultParameters: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const adminChannelSchema = new Schema<IAdminChannel>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    icon: {
      type: String,
      trim: true,
      default: '',
    },
    entries: {
      type: [adminChannelEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export default adminChannelSchema;

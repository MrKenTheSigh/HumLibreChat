import { Schema } from 'mongoose';
import type { IAdminSystemSetting } from '~/types';

const adminSystemSettingSchema = new Schema<IAdminSystemSetting>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    value: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

export default adminSystemSettingSchema;

import type { Document } from 'mongoose';

export interface IAdminSystemSetting extends Document {
  key: string;
  value: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

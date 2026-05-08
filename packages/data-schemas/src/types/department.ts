import type { Document, Types } from 'mongoose';

export interface IDepartment extends Document {
  code: string;
  name: string;
  description?: string;
  parentDepartmentId?: Types.ObjectId | string | null;
  managerUserId?: Types.ObjectId | string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

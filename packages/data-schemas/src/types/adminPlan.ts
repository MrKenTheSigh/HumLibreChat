import type { Document } from 'mongoose';

export interface IAdminPlan extends Document {
  name: string;
  slug: string;
  description?: string;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  channelIds: string[];
  notes?: string;
  startingCredits?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

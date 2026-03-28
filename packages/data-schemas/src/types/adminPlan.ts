import type { Document } from 'mongoose';

export interface IAdminPlanModelEntitlement {
  channelId: string;
  endpoint: string;
  model: string;
}

export interface IAdminPlan extends Document {
  name: string;
  slug: string;
  description?: string;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  channelIds: string[];
  modelEntitlements: IAdminPlanModelEntitlement[];
  notes?: string;
  startingCredits?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

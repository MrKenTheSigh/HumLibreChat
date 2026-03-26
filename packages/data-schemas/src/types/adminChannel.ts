import type { Document } from 'mongoose';

export type IAdminChannelEntry = {
  endpoint: string;
  model: string;
  label: string;
  enabled: boolean;
  defaultParameters: null;
};

export interface IAdminChannel extends Document {
  name: string;
  slug: string;
  description?: string;
  enabled?: boolean;
  sortOrder?: number;
  icon?: string;
  entries: IAdminChannelEntry[];
  createdAt?: Date;
  updatedAt?: Date;
}

import type { Document } from 'mongoose';

export type IAdminChannelProviderType =
  | 'azureOpenAI'
  | 'custom'
  | 'ollama'
  | 'openAI'
  | 'google'
  | 'anthropic'
  | 'bedrock';

export type IAdminChannelPricingOverride = {
  prompt?: number | null;
  completion?: number | null;
  write?: number | null;
  read?: number | null;
};

export type IAdminChannelHeader = {
  key: string;
  value: string;
};

export type IAdminChannelConnection = {
  runtimeEndpoint: string;
  baseURL?: string;
  ocrMaxPages?: number;
  instanceName?: string;
  apiVersion?: string;
  region?: string;
  modelFetch?: boolean;
  headers?: IAdminChannelHeader[];
};

export type IAdminChannelSecrets = {
  apiKey?: string;
  apiKeyRef?: string;
  accessKeyId?: string;
  accessKeyIdRef?: string;
  secretAccessKey?: string;
  secretAccessKeyRef?: string;
  sessionToken?: string;
  sessionTokenRef?: string;
};

export type IAdminChannelModel = {
  model: string;
  enabled: boolean;
  deploymentName?: string;
  pricingOverride?: IAdminChannelPricingOverride | null;
};

export interface IAdminChannel extends Document {
  name: string;
  slug: string;
  providerType: IAdminChannelProviderType;
  description?: string;
  enabled?: boolean;
  sortOrder?: number;
  connection: IAdminChannelConnection;
  secrets: IAdminChannelSecrets;
  models: IAdminChannelModel[];
  createdAt?: Date;
  updatedAt?: Date;
}

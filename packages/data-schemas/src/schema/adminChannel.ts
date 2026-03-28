import { Schema } from 'mongoose';
import type { IAdminChannel } from '../types';

const adminChannelHeaderSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

const adminChannelPricingOverrideSchema = new Schema(
  {
    prompt: {
      type: Number,
      default: null,
    },
    completion: {
      type: Number,
      default: null,
    },
    write: {
      type: Number,
      default: null,
    },
    read: {
      type: Number,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const adminChannelModelSchema = new Schema(
  {
    model: {
      type: String,
      required: true,
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    deploymentName: {
      type: String,
      trim: true,
      default: '',
    },
    pricingOverride: {
      type: adminChannelPricingOverrideSchema,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const adminChannelConnectionSchema = new Schema(
  {
    runtimeEndpoint: {
      type: String,
      required: true,
      trim: true,
    },
    baseURL: {
      type: String,
      trim: true,
      default: '',
    },
    instanceName: {
      type: String,
      trim: true,
      default: '',
    },
    apiVersion: {
      type: String,
      trim: true,
      default: '',
    },
    region: {
      type: String,
      trim: true,
      default: '',
    },
    modelFetch: {
      type: Boolean,
      default: false,
    },
    headers: {
      type: [adminChannelHeaderSchema],
      default: [],
    },
  },
  {
    _id: false,
  },
);

const adminChannelSecretsSchema = new Schema(
  {
    apiKey: {
      type: String,
      trim: true,
      default: '',
    },
    apiKeyRef: {
      type: String,
      trim: true,
      default: '',
    },
    accessKeyId: {
      type: String,
      trim: true,
      default: '',
    },
    accessKeyIdRef: {
      type: String,
      trim: true,
      default: '',
    },
    secretAccessKey: {
      type: String,
      trim: true,
      default: '',
    },
    secretAccessKeyRef: {
      type: String,
      trim: true,
      default: '',
    },
    sessionToken: {
      type: String,
      trim: true,
      default: '',
    },
    sessionTokenRef: {
      type: String,
      trim: true,
      default: '',
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
    providerType: {
      type: String,
      required: true,
      enum: ['azureOpenAI', 'custom', 'ollama', 'openAI', 'google', 'anthropic', 'bedrock'],
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
    connection: {
      type: adminChannelConnectionSchema,
      default: () => ({
        runtimeEndpoint: '',
        baseURL: '',
        instanceName: '',
        apiVersion: '',
        region: '',
        modelFetch: false,
        headers: [],
      }),
    },
    secrets: {
      type: adminChannelSecretsSchema,
      default: () => ({
        apiKey: '',
        apiKeyRef: '',
        accessKeyId: '',
        accessKeyIdRef: '',
        secretAccessKey: '',
        secretAccessKeyRef: '',
        sessionToken: '',
        sessionTokenRef: '',
      }),
    },
    models: {
      type: [adminChannelModelSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export default adminChannelSchema;

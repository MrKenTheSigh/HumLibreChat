const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({
  base: path.resolve(__dirname, '..', '..', '..', '..', 'api'),
});

const connect = require('../../../../config/connect');

function summarizeId(value) {
  const text = value == null ? '' : value.toString();

  return {
    value: text,
    constructorName: value?.constructor?.name ?? '',
    bsonType: value?._bsontype ?? '',
    isValidObjectId: text.length > 0 ? mongoose.Types.ObjectId.isValid(text) : false,
  };
}

function summarizeSecret(value) {
  const text = typeof value === 'string' ? value : '';

  return {
    present: text.length > 0,
    length: text.length,
  };
}

function summarizeConnection(connection) {
  return {
    runtimeEndpoint: connection?.runtimeEndpoint ?? '',
    baseURL: connection?.baseURL ?? '',
    instanceName: connection?.instanceName ?? '',
    apiVersion: connection?.apiVersion ?? '',
    region: connection?.region ?? '',
    modelFetch: connection?.modelFetch ?? false,
    headerCount: Array.isArray(connection?.headers) ? connection.headers.length : 0,
  };
}

function summarizeSecrets(secrets) {
  return {
    apiKey: summarizeSecret(secrets?.apiKey),
    apiKeyRef: secrets?.apiKeyRef ?? '',
    accessKeyId: summarizeSecret(secrets?.accessKeyId),
    accessKeyIdRef: secrets?.accessKeyIdRef ?? '',
    secretAccessKey: summarizeSecret(secrets?.secretAccessKey),
    secretAccessKeyRef: secrets?.secretAccessKeyRef ?? '',
    sessionToken: summarizeSecret(secrets?.sessionToken),
    sessionTokenRef: secrets?.sessionTokenRef ?? '',
  };
}

function summarizeModel(model) {
  return {
    model: model?.model ?? '',
    enabled: model?.enabled ?? false,
    deploymentName: model?.deploymentName ?? '',
    pricingOverride: model?.pricingOverride ?? null,
  };
}

async function run() {
  await connect();

  try {
    const { AdminChannel } = createModels(mongoose);
    const channels = await AdminChannel.find({})
      .sort({ sortOrder: 1, name: 1, _id: 1 })
      .lean();

    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          count: channels.length,
          channels: channels.map((channel) => ({
            id: summarizeId(channel._id),
            name: channel.name ?? '',
            slug: channel.slug ?? '',
            providerType: channel.providerType ?? '',
            enabled: channel.enabled ?? false,
            sortOrder: channel.sortOrder ?? 0,
            connection: summarizeConnection(channel.connection),
            secrets: summarizeSecrets(channel.secrets),
            models: Array.isArray(channel.models) ? channel.models.map(summarizeModel) : [],
            legacyEntryCount: Array.isArray(channel.entries) ? channel.entries.length : 0,
            createdAt: channel.createdAt ?? null,
            updatedAt: channel.updatedAt ?? null,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { run };

const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({
  base: path.resolve(__dirname, '..', '..', '..', '..', 'api'),
});

const connect = require('../../../../config/connect');

const recommendedModel = 'gemma4:e4b';
const fallbackBaseURL = 'http://localhost:11434/v1';

function normalizeBaseURL(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.length === 0) {
    return fallbackBaseURL;
  }

  return trimmed.replace(/\/+$/, '').endsWith('/v1')
    ? trimmed.replace(/\/+$/, '')
    : `${trimmed.replace(/\/+$/, '')}/v1`;
}

function normalizeModels(models) {
  const existingModels = Array.isArray(models) ? models : [];
  const hasRecommendedModel = existingModels.some((model) => model?.model === recommendedModel);

  if (hasRecommendedModel) {
    return existingModels.map((model) =>
      model?.model === recommendedModel
        ? {
            ...model,
            enabled: true,
          }
        : model,
    );
  }

  return [
    ...existingModels,
    {
      model: recommendedModel,
      enabled: true,
      deploymentName: '',
      pricingOverride: null,
    },
  ];
}

async function run() {
  await connect();

  try {
    const { AdminChannel } = createModels(mongoose);
    const existingChannel = await AdminChannel.findOne({
      $or: [{ slug: 'ollama' }, { providerType: 'ollama' }],
    });

    if (!existingChannel) {
      const created = await AdminChannel.create({
        name: 'Ollama',
        slug: 'ollama',
        providerType: 'ollama',
        description: 'Local Ollama runtime channel',
        enabled: true,
        sortOrder: 0,
        connection: {
          runtimeEndpoint: 'ollama',
          baseURL: fallbackBaseURL,
          instanceName: '',
          apiVersion: '',
          region: '',
          modelFetch: true,
          headers: [],
        },
        secrets: {
          apiKey: '',
          apiKeyRef: '',
          accessKeyId: '',
          accessKeyIdRef: '',
          secretAccessKey: '',
          secretAccessKeyRef: '',
          sessionToken: '',
          sessionTokenRef: '',
        },
        models: [
          {
            model: recommendedModel,
            enabled: true,
            deploymentName: '',
            pricingOverride: null,
          },
        ],
      });

      console.log(
        JSON.stringify(
          {
            action: 'created',
            channelId: created._id.toString(),
            model: recommendedModel,
          },
          null,
          2,
        ),
      );
      return;
    }

    existingChannel.name = existingChannel.name || 'Ollama';
    existingChannel.slug = existingChannel.slug || 'ollama';
    existingChannel.providerType = 'ollama';
    existingChannel.enabled = true;
    existingChannel.connection = {
      runtimeEndpoint: 'ollama',
      baseURL: normalizeBaseURL(existingChannel.connection?.baseURL),
      instanceName: existingChannel.connection?.instanceName ?? '',
      apiVersion: existingChannel.connection?.apiVersion ?? '',
      region: existingChannel.connection?.region ?? '',
      modelFetch: true,
      headers: existingChannel.connection?.headers ?? [],
    };
    existingChannel.secrets = {
      apiKey: '',
      apiKeyRef: '',
      accessKeyId: '',
      accessKeyIdRef: '',
      secretAccessKey: '',
      secretAccessKeyRef: '',
      sessionToken: '',
      sessionTokenRef: '',
      ...existingChannel.secrets,
    };
    existingChannel.models = normalizeModels(existingChannel.models);

    await existingChannel.save();

    console.log(
      JSON.stringify(
        {
          action: 'updated',
          channelId: existingChannel._id.toString(),
          model: recommendedModel,
          models: existingChannel.models.map((model) => ({
            model: model.model,
            enabled: model.enabled,
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

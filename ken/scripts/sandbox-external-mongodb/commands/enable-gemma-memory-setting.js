const path = require('path');
const mongoose = require('mongoose');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', '..', '..', 'api') });
const connect = require('../../../../config/connect');

async function run() {
  await connect();

  const value = {
    enabled: true,
    validKeys: [],
    tokenLimit: 10000,
    messageWindowSize: 5,
    agent: {
      provider: 'ollama',
      model: 'gemma4:e4b',
      instructions:
        'You are a memory management assistant. Store and manage user information accurately.',
      model_parameters: {
        temperature: 0,
      },
    },
  };

  const now = new Date();
  const result = await mongoose.connection.collection('adminsystemsettings').findOneAndUpdate(
    { key: 'memory' },
    {
      $set: {
        key: 'memory',
        value,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
    },
  );

  console.log(JSON.stringify({ updated: true, setting: result.value }, null, 2));
  await mongoose.disconnect();
}

module.exports = { run };

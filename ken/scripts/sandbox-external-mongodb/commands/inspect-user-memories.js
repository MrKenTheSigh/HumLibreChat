const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', '..', '..', 'api') });
const connect = require('../../../../config/connect');

function serializeDocument(document) {
  return document == null ? null : JSON.parse(JSON.stringify(document));
}

async function run() {
  const usernameOrEmail = process.argv[3] || 'test@test.test';

  await connect();

  const models = createModels(mongoose);
  const user = await models.User.findOne({
    $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }, { name: usernameOrEmail }],
  })
    .select('_id username email name role personalization')
    .lean();

  if (!user) {
    console.log(JSON.stringify({ found: false, usernameOrEmail }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const memories = await models.MemoryEntry.find({ userId: user._id })
    .sort({ updated_at: -1, _id: -1 })
    .lean();

  console.log(
    JSON.stringify(
      {
        found: true,
        checkedAt: new Date().toISOString(),
        user: serializeDocument(user),
        memoryCount: memories.length,
        memories: serializeDocument(memories),
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

module.exports = { run };

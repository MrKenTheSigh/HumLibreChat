const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', '..', '..', 'api') });
const connect = require('../../../../config/connect');

function serializeDocument(document) {
  return document == null ? null : JSON.parse(JSON.stringify(document));
}

async function run() {
  const usernameOrEmail = process.argv[3] || '';

  await connect();

  const models = createModels(mongoose);
  const user = usernameOrEmail
    ? await models.User.findOne({
        $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }, { name: usernameOrEmail }],
      })
        .select('_id username email name role')
        .lean()
    : null;

  const userFilter = user ? { user: user._id.toString() } : {};
  const actorUserFilter = user ? { actorUserId: user._id } : {};
  const setting = await models.AdminSystemSetting.findOne({ key: 'sensitive_information_policy' })
    .select('key value updatedAt')
    .lean();

  const recentSensitiveMessages = await models.Message.find({
    ...userFilter,
    'sensitiveDetection.totalCount': { $gt: 0 },
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('messageId conversationId user createdAt isCreatedByUser sensitiveDetection')
    .lean();

  const recentSensitiveLogs = await models.ActivityLog.find({
    ...actorUserFilter,
    action: /^sensitive_information_policy\./,
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('eventId actorUserId action result message metadata createdAt')
    .lean();

  const lastUserMessages = await models.Message.find({
    ...userFilter,
    isCreatedByUser: true,
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('messageId conversationId user createdAt text sensitiveDetection')
    .lean();

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        user: serializeDocument(user),
        policySetting: serializeDocument(setting),
        recentSensitiveMessageCount: recentSensitiveMessages.length,
        recentSensitiveMessages: serializeDocument(recentSensitiveMessages),
        recentSensitiveLogCount: recentSensitiveLogs.length,
        recentSensitiveLogs: serializeDocument(recentSensitiveLogs),
        recentUserMessages: serializeDocument(
          lastUserMessages.map((message) => ({
            ...message,
            text: typeof message.text === 'string' ? message.text.slice(0, 120) : message.text,
          })),
        ),
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

module.exports = { run };

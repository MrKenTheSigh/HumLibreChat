const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { Message, Transaction } = require('~/db/models');

function normalizeTransactionUser(user) {
  if (!user) {
    return null;
  }

  if (user instanceof mongoose.Types.ObjectId) {
    return user;
  }

  if (typeof user === 'string' && mongoose.Types.ObjectId.isValid(user)) {
    return new mongoose.Types.ObjectId(user);
  }

  return null;
}

async function getMessageCreditUsage({ user, messageId }) {
  if (!user || !messageId) {
    return null;
  }

  const transactionUser = normalizeTransactionUser(user);

  if (!transactionUser) {
    return null;
  }

  const [summary] = await Transaction.aggregate([
    {
      $match: {
        user: transactionUser,
        messageId,
        tokenType: { $in: ['prompt', 'completion'] },
        tokenValue: { $type: 'number' },
      },
    },
    {
      $group: {
        _id: '$messageId',
        netTokenValue: { $sum: '$tokenValue' },
      },
    },
  ]);

  if (!summary) {
    return null;
  }

  return {
    spentCredits: Math.max(-summary.netTokenValue, 0),
    status: 'final',
  };
}

async function syncMessageCreditUsage({ user, messageId }) {
  try {
    const creditUsage = await getMessageCreditUsage({ user, messageId });
    const messageUser = typeof user === 'string' ? user : user.toString();

    if (!creditUsage) {
      return null;
    }

    await Message.findOneAndUpdate(
      { user: messageUser, messageId },
      { creditUsage },
      {
        new: true,
      },
    );

    return creditUsage;
  } catch (error) {
    logger.error('[messageCreditUsage] Failed to sync message credit usage', {
      message: error?.message,
      stack: error?.stack,
      user,
      messageId,
    });
    return null;
  }
}

async function saveMessageCreditUsage({ user, messageId, creditUsage }) {
  if (!user || !messageId || !creditUsage) {
    return null;
  }

  try {
    const messageUser = typeof user === 'string' ? user : user.toString();

    await Message.findOneAndUpdate(
      { user: messageUser, messageId },
      { creditUsage },
      {
        new: true,
      },
    );

    return creditUsage;
  } catch (error) {
    logger.error('[messageCreditUsage] Failed to save message credit usage', {
      message: error?.message,
      stack: error?.stack,
      user,
      messageId,
    });
    return null;
  }
}

module.exports = {
  getMessageCreditUsage,
  saveMessageCreditUsage,
  syncMessageCreditUsage,
};

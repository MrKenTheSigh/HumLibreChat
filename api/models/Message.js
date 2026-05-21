const { z } = require('zod');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const {
  SENSITIVE_DETECTION_VERSION,
  createTempChatExpirationDate,
  detectSensitiveText,
  evaluateSensitivePolicy,
  getSensitiveInformationDailyRuleCounts,
  getSensitiveInformationWindowStartDate,
  getStoredSensitiveInformationPolicySystemSetting,
  updateSensitiveInformationDailySummaryDelta,
  writeActivityLog,
} = require('@librechat/api');
const { Message, Transaction } = require('~/db/models');

const idSchema = z.string().uuid();

function getTextFromContent(content) {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (typeof part?.text === 'string') {
        return part.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function getMessageTextForSensitiveDetection(message) {
  const text = typeof message.text === 'string' ? message.text : '';
  const contentText = getTextFromContent(message.content);
  return [text, contentText].filter(Boolean).join('\n');
}

function addSensitiveRuleMatches(ruleMatchesByCode, matches) {
  if (!Array.isArray(matches)) {
    return;
  }

  for (const match of matches) {
    if (!match?.ruleCode || !match?.label || typeof match?.count !== 'number') {
      continue;
    }

    const existingMatch = ruleMatchesByCode.get(match.ruleCode);
    if (existingMatch) {
      existingMatch.count += match.count;
      continue;
    }

    ruleMatchesByCode.set(match.ruleCode, {
      ruleCode: match.ruleCode,
      label: match.label,
      count: match.count,
    });
  }
}

function getFileSensitiveDetection(file) {
  return file?.metadata?.sensitiveDetection ?? file?.sensitiveDetection;
}

function getFilesSensitiveRuleMatches(message) {
  const ruleMatchesByCode = new Map();
  const files = Array.isArray(message.files) ? message.files : [];

  for (const file of files) {
    const sensitiveDetection = getFileSensitiveDetection(file);
    if (!sensitiveDetection || sensitiveDetection.totalCount <= 0) {
      continue;
    }
    addSensitiveRuleMatches(ruleMatchesByCode, sensitiveDetection.ruleMatches);
  }

  return Array.from(ruleMatchesByCode.values());
}

function buildMessageSensitiveDetection(message) {
  const textDetection = detectSensitiveText(getMessageTextForSensitiveDetection(message));
  const ruleMatchesByCode = new Map();

  addSensitiveRuleMatches(ruleMatchesByCode, textDetection.ruleMatches);
  addSensitiveRuleMatches(ruleMatchesByCode, getFilesSensitiveRuleMatches(message));

  const ruleMatches = Array.from(ruleMatchesByCode.values());

  return {
    ruleMatches,
    source: 'chat_message',
    evaluatedAt: new Date(),
    version: SENSITIVE_DETECTION_VERSION,
    totalCount: ruleMatches.reduce((sum, match) => sum + match.count, 0),
  };
}

function attachSensitiveDetection(update) {
  if (update.isCreatedByUser !== true) {
    return update;
  }

  return {
    ...update,
    sensitiveDetection: buildMessageSensitiveDetection(update),
  };
}

function attachSensitivePolicyWarning(req, update) {
  const warning = req?._sensitiveInformationPolicyWarning;
  if (update.isCreatedByUser !== true || warning?.action !== 'warn') {
    return update;
  }

  return {
    ...update,
    metadata: {
      ...(update.metadata ?? {}),
      sensitiveInformationPolicy: {
        warned: true,
        action: warning.action,
        evaluatedAt: new Date(),
        decisions: warning.decisions,
      },
    },
  };
}

function getTriggeredSensitivePolicyDecisions(decisions) {
  return decisions.filter((decision) => decision.action !== 'none');
}

function getHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

async function evaluateSensitiveInformationPolicyForMessage(req, message) {
  try {
    if (req?._sensitiveInformationPolicyPreflightEvaluated === true) {
      return;
    }

    if (message?.isCreatedByUser !== true || message?.sensitiveDetection?.totalCount <= 0) {
      return;
    }

    const policy = await getStoredSensitiveInformationPolicySystemSetting();
    if (!policy.enabled) {
      return;
    }

    const userId = message.user?.toString();
    if (!userId) {
      return;
    }

    const endAt = new Date();
    const startAt = getSensitiveInformationWindowStartDate(policy.window.durationDays, endAt);
    const ruleCounts = await getSensitiveInformationDailyRuleCounts({ userId, startAt, endAt });
    const evaluation = evaluateSensitivePolicy({
      policies: policy.rules,
      ruleCounts,
    });
    const triggeredDecisions = getTriggeredSensitivePolicyDecisions(evaluation.decisions);

    if (triggeredDecisions.length === 0) {
      return;
    }

    await writeActivityLog({
      actorUserId: userId,
      actorRole: req.user?.role ?? null,
      actorDepartmentId: req.user?.departmentId ?? null,
      requestIp: req.ip ?? req.socket?.remoteAddress ?? null,
      userAgent: getHeaderValue(req.headers?.['user-agent']),
      resourceType: 'message',
      resourceId: message.messageId,
      action: 'sensitive_information_policy.evaluate',
      result: 'success',
      message: `Sensitive information policy evaluated: ${evaluation.action}`,
      metadata: {
        action: evaluation.action,
        durationDays: policy.window.durationDays,
        totalCount: Object.values(ruleCounts).reduce((sum, count) => sum + count, 0),
        triggeredRules: triggeredDecisions.length,
        decisions: JSON.stringify(
          triggeredDecisions.map((decision) => ({
            ruleCode: decision.ruleCode,
            count: decision.count,
            action: decision.action,
            minCount: decision.threshold?.minCount ?? null,
          })),
        ),
      },
    });
  } catch (error) {
    logger.error('[evaluateSensitiveInformationPolicyForMessage]', error);
  }
}

async function updateSensitiveInformationSummaryForMessage(req, message, previousDetection = null) {
  if (message?.isCreatedByUser !== true || message?.sensitiveDetection?.totalCount <= 0) {
    if (!previousDetection?.totalCount) {
      return;
    }
  }

  if (message?.isCreatedByUser !== true) {
    return;
  }

  const userId = message.user?.toString();
  if (!userId) {
    return;
  }

  await updateSensitiveInformationDailySummaryDelta({
    userId,
    departmentId: req.user?.departmentId ?? null,
    previousDetection,
    currentDetection: message.sensitiveDetection,
    outcome: 'submitted',
    occurredAt: message.createdAt ?? new Date(),
  });
}

/**
 * Saves a message in the database.
 *
 * @async
 * @function saveMessage
 * @param {ServerRequest} req - The request object containing user information.
 * @param {Object} params - The message data object.
 * @param {string} params.endpoint - The endpoint where the message originated.
 * @param {string} params.iconURL - The URL of the sender's icon.
 * @param {string} params.messageId - The unique identifier for the message.
 * @param {string} params.newMessageId - The new unique identifier for the message (if applicable).
 * @param {string} params.conversationId - The identifier of the conversation.
 * @param {string} [params.parentMessageId] - The identifier of the parent message, if any.
 * @param {string} params.sender - The identifier of the sender.
 * @param {string} params.text - The text content of the message.
 * @param {boolean} params.isCreatedByUser - Indicates if the message was created by the user.
 * @param {string} [params.error] - Any error associated with the message.
 * @param {boolean} [params.unfinished] - Indicates if the message is unfinished.
 * @param {Object[]} [params.files] - An array of files associated with the message.
 * @param {string} [params.finish_reason] - Reason for finishing the message.
 * @param {number} [params.tokenCount] - The number of tokens in the message.
 * @param {string} [params.plugin] - Plugin associated with the message.
 * @param {string[]} [params.plugins] - An array of plugins associated with the message.
 * @param {string} [params.model] - The model used to generate the message.
 * @param {Object} [metadata] - Additional metadata for this operation
 * @param {string} [metadata.context] - The context of the operation
 * @returns {Promise<TMessage>} The updated or newly inserted message document.
 * @throws {Error} If there is an error in saving the message.
 */
async function saveMessage(req, params, metadata) {
  if (!req?.user?.id) {
    throw new Error('User not authenticated');
  }

  const validConvoId = idSchema.safeParse(params.conversationId);
  if (!validConvoId.success) {
    logger.warn(`Invalid conversation ID: ${params.conversationId}`);
    logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
    logger.info(`---Invalid conversation ID Params: ${JSON.stringify(params, null, 2)}`);
    return;
  }

  try {
    const update = attachSensitivePolicyWarning(
      req,
      attachSensitiveDetection({
        ...params,
        user: req.user.id,
        messageId: params.newMessageId || params.messageId,
      }),
    );

    if (req?.body?.isTemporary) {
      try {
        const appConfig = req.config;
        update.expiredAt = createTempChatExpirationDate(appConfig?.interfaceConfig);
      } catch (err) {
        logger.error('Error creating temporary chat expiration date:', err);
        logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
        update.expiredAt = null;
      }
    } else {
      update.expiredAt = null;
    }

    if (update.tokenCount != null && isNaN(update.tokenCount)) {
      logger.warn(
        `Resetting invalid \`tokenCount\` for message \`${params.messageId}\`: ${update.tokenCount}`,
      );
      logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
      update.tokenCount = 0;
    }
    const previousMessage = await Message.findOne({ messageId: params.messageId, user: req.user.id })
      .select('sensitiveDetection')
      .lean();
    const message = await Message.findOneAndUpdate(
      { messageId: params.messageId, user: req.user.id },
      update,
      { upsert: true, new: true },
    );

    await updateSensitiveInformationSummaryForMessage(
      req,
      message,
      previousMessage?.sensitiveDetection ?? null,
    );
    await evaluateSensitiveInformationPolicyForMessage(req, message);

    return message.toObject();
  } catch (err) {
    logger.error('Error saving message:', err);
    logger.info(`---\`saveMessage\` context: ${metadata?.context}`);

    // Check if this is a duplicate key error (MongoDB error code 11000)
    if (err.code === 11000 && err.message.includes('duplicate key error')) {
      // Log the duplicate key error but don't crash the application
      logger.warn(`Duplicate messageId detected: ${params.messageId}. Continuing execution.`);

      try {
        // Try to find the existing message with this ID
        const existingMessage = await Message.findOne({
          messageId: params.messageId,
          user: req.user.id,
        });

        // If we found it, return it
        if (existingMessage) {
          return existingMessage.toObject();
        }

        // If we can't find it (unlikely but possible in race conditions)
        return {
          ...params,
          messageId: params.messageId,
          user: req.user.id,
        };
      } catch (findError) {
        // If the findOne also fails, log it but don't crash
        logger.warn(
          `Could not retrieve existing message with ID ${params.messageId}: ${findError.message}`,
        );
        return {
          ...params,
          messageId: params.messageId,
          user: req.user.id,
        };
      }
    }

    throw err; // Re-throw other errors
  }
}

/**
 * Saves multiple messages in the database in bulk.
 *
 * @async
 * @function bulkSaveMessages
 * @param {Object[]} messages - An array of message objects to save.
 * @param {boolean} [overrideTimestamp=false] - Indicates whether to override the timestamps of the messages. Defaults to false.
 * @returns {Promise<Object>} The result of the bulk write operation.
 * @throws {Error} If there is an error in saving messages in bulk.
 */
async function bulkSaveMessages(messages, overrideTimestamp = false) {
  try {
    const bulkOps = messages.map((message) => ({
      updateOne: {
        filter: { messageId: message.messageId },
        update: message,
        timestamps: !overrideTimestamp,
        upsert: true,
      },
    }));
    const result = await Message.bulkWrite(bulkOps);
    return result;
  } catch (err) {
    logger.error('Error saving messages in bulk:', err);
    throw err;
  }
}

/**
 * Records a message in the database.
 *
 * @async
 * @function recordMessage
 * @param {Object} params - The message data object.
 * @param {string} params.user - The identifier of the user.
 * @param {string} params.endpoint - The endpoint where the message originated.
 * @param {string} params.messageId - The unique identifier for the message.
 * @param {string} params.conversationId - The identifier of the conversation.
 * @param {string} [params.parentMessageId] - The identifier of the parent message, if any.
 * @param {Partial<TMessage>} rest - Any additional properties from the TMessage typedef not explicitly listed.
 * @returns {Promise<Object>} The updated or newly inserted message document.
 * @throws {Error} If there is an error in saving the message.
 */
async function recordMessage({
  user,
  endpoint,
  messageId,
  conversationId,
  parentMessageId,
  ...rest
}) {
  try {
    // No parsing of convoId as may use threadId
    const message = {
      user,
      endpoint,
      messageId,
      conversationId,
      parentMessageId,
      ...rest,
    };

    return await Message.findOneAndUpdate({ user, messageId }, message, {
      upsert: true,
      new: true,
    });
  } catch (err) {
    logger.error('Error recording message:', err);
    throw err;
  }
}

/**
 * Updates the text of a message.
 *
 * @async
 * @function updateMessageText
 * @param {Object} params - The update data object.
 * @param {Object} req - The request object.
 * @param {string} params.messageId - The unique identifier for the message.
 * @param {string} params.text - The new text content of the message.
 * @returns {Promise<void>}
 * @throws {Error} If there is an error in updating the message text.
 */
async function updateMessageText(req, { messageId, text }) {
  try {
    await Message.updateOne({ messageId, user: req.user.id }, { text });
  } catch (err) {
    logger.error('Error updating message text:', err);
    throw err;
  }
}

/**
 * Updates a message.
 *
 * @async
 * @function updateMessage
 * @param {Object} req - The request object.
 * @param {Object} message - The message object containing update data.
 * @param {string} message.messageId - The unique identifier for the message.
 * @param {string} [message.text] - The new text content of the message.
 * @param {Object[]} [message.files] - The files associated with the message.
 * @param {boolean} [message.isCreatedByUser] - Indicates if the message was created by the user.
 * @param {string} [message.sender] - The identifier of the sender.
 * @param {number} [message.tokenCount] - The number of tokens in the message.
 * @param {Object} [metadata] - The operation metadata
 * @param {string} [metadata.context] - The operation metadata
 * @returns {Promise<TMessage>} The updated message document.
 * @throws {Error} If there is an error in updating the message or if the message is not found.
 */
async function updateMessage(req, message, metadata) {
  try {
    const { messageId, ...rawUpdate } = message;
    let update = rawUpdate;
    let existingMessage = null;
    if (
      rawUpdate.isCreatedByUser === true ||
      rawUpdate.text != null ||
      Array.isArray(rawUpdate.content)
    ) {
      existingMessage = await Message.findOne({ messageId, user: req.user.id })
        .select('isCreatedByUser text content files sensitiveDetection')
        .lean();
      if (rawUpdate.isCreatedByUser === true || existingMessage?.isCreatedByUser === true) {
        update = attachSensitiveDetection({
          ...existingMessage,
          ...rawUpdate,
          isCreatedByUser: true,
        });
      }
    }
    const updatedMessage = await Message.findOneAndUpdate(
      { messageId, user: req.user.id },
      update,
      {
        new: true,
      },
    );

    if (!updatedMessage) {
      throw new Error('Message not found or user not authorized.');
    }

    if (update.sensitiveDetection || existingMessage?.sensitiveDetection) {
      await updateSensitiveInformationSummaryForMessage(
        req,
        updatedMessage,
        existingMessage?.sensitiveDetection ?? null,
      );
    }

    return {
      messageId: updatedMessage.messageId,
      conversationId: updatedMessage.conversationId,
      parentMessageId: updatedMessage.parentMessageId,
      sender: updatedMessage.sender,
      text: updatedMessage.text,
      isCreatedByUser: updatedMessage.isCreatedByUser,
      tokenCount: updatedMessage.tokenCount,
      feedback: updatedMessage.feedback,
    };
  } catch (err) {
    logger.error('Error updating message:', err);
    if (metadata && metadata?.context) {
      logger.info(`---\`updateMessage\` context: ${metadata.context}`);
    }
    throw err;
  }
}

/**
 * Deletes messages in a conversation since a specific message.
 *
 * @async
 * @function deleteMessagesSince
 * @param {Object} params - The parameters object.
 * @param {Object} req - The request object.
 * @param {string} params.messageId - The unique identifier for the message.
 * @param {string} params.conversationId - The identifier of the conversation.
 * @returns {Promise<Number>} The number of deleted messages.
 * @throws {Error} If there is an error in deleting messages.
 */
async function deleteMessagesSince(req, { messageId, conversationId }) {
  try {
    const message = await Message.findOne({ messageId, user: req.user.id }).lean();

    if (message) {
      const query = Message.find({ conversationId, user: req.user.id });
      return await query.deleteMany({
        createdAt: { $gt: message.createdAt },
      });
    }
    return undefined;
  } catch (err) {
    logger.error('Error deleting messages:', err);
    throw err;
  }
}

/**
 * Retrieves messages from the database.
 * @async
 * @function getMessages
 * @param {Record<string, unknown>} filter - The filter criteria.
 * @param {string | undefined} [select] - The fields to select.
 * @returns {Promise<TMessage[]>} The messages that match the filter criteria.
 * @throws {Error} If there is an error in retrieving messages.
 */
async function getMessages(filter, select) {
  try {
    if (select) {
      return await Message.find(filter).select(select).sort({ createdAt: 1 }).lean();
    }

    return await Message.find(filter).sort({ createdAt: 1 }).lean();
  } catch (err) {
    logger.error('Error getting messages:', err);
    throw err;
  }
}

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

async function attachCreditUsageToMessages({ user, messages }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  const transactionUser = normalizeTransactionUser(user);
  if (!transactionUser) {
    return messages;
  }

  const unresolvedMessages = messages.filter(
    (message) =>
      !message?.isCreatedByUser &&
      message?.messageId != null &&
      message?.creditUsage == null,
  );

  if (unresolvedMessages.length === 0) {
    return messages;
  }

  const messageIds = unresolvedMessages.map((message) => message.messageId);
  const summaries = await Transaction.aggregate([
    {
      $match: {
        user: transactionUser,
        messageId: { $in: messageIds },
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

  if (summaries.length === 0) {
    return messages;
  }

  const summaryMap = new Map(
    summaries.map((summary) => [
      summary._id,
      {
        spentCredits: Math.max(-summary.netTokenValue, 0),
        status: 'final',
      },
    ]),
  );

  return messages.map((message) => {
    if (message?.creditUsage != null || message?.isCreatedByUser || message?.messageId == null) {
      return message;
    }

    const creditUsage = summaryMap.get(message.messageId);
    if (!creditUsage) {
      return message;
    }

    return {
      ...message,
      creditUsage,
    };
  });
}

/**
 * Retrieves a single message from the database.
 * @async
 * @function getMessage
 * @param {{ user: string, messageId: string }} params - The search parameters
 * @returns {Promise<TMessage | null>} The message that matches the criteria or null if not found
 * @throws {Error} If there is an error in retrieving the message
 */
async function getMessage({ user, messageId }) {
  try {
    return await Message.findOne({
      user,
      messageId,
    }).lean();
  } catch (err) {
    logger.error('Error getting message:', err);
    throw err;
  }
}

/**
 * Deletes messages from the database.
 *
 * @async
 * @function deleteMessages
 * @param {import('mongoose').FilterQuery<import('mongoose').Document>} filter - The filter criteria to find messages to delete.
 * @returns {Promise<import('mongoose').DeleteResult>} The metadata with count of deleted messages.
 * @throws {Error} If there is an error in deleting messages.
 */
async function deleteMessages(filter) {
  try {
    return await Message.deleteMany(filter);
  } catch (err) {
    logger.error('Error deleting messages:', err);
    throw err;
  }
}

module.exports = {
  saveMessage,
  bulkSaveMessages,
  recordMessage,
  updateMessageText,
  updateMessage,
  deleteMessagesSince,
  getMessages,
  getMessage,
  attachCreditUsageToMessages,
  deleteMessages,
};

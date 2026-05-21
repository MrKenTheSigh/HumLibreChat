const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const {
  SENSITIVE_DETECTION_VERSION,
  SENSITIVE_RULE_LABELS,
  detectSensitiveText,
  evaluateSensitivePolicy,
  getSensitiveInformationDailyRuleCounts,
  getSensitiveInformationWindowStartDate,
  getStoredSensitiveInformationPolicySystemSetting,
  updateSensitiveInformationDailySummary,
  writeActivityLog,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { File, Message } = require('~/db/models');

function getHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function addRuleMatches(ruleMatchesByCode, matches) {
  if (!Array.isArray(matches)) {
    return;
  }

  for (const match of matches) {
    if (!match?.ruleCode || typeof match?.count !== 'number' || match.count <= 0) {
      continue;
    }

    const existing = ruleMatchesByCode.get(match.ruleCode);
    if (existing) {
      existing.count += match.count;
      continue;
    }

    ruleMatchesByCode.set(match.ruleCode, {
      ruleCode: match.ruleCode,
      label: match.label ?? SENSITIVE_RULE_LABELS[match.ruleCode] ?? match.ruleCode,
      count: match.count,
    });
  }
}

function getRequestFileIds(req) {
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  return files
    .map((file) => file?.file_id)
    .filter((fileId) => typeof fileId === 'string' && fileId.length > 0);
}

function getUserObjectId(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }
  return new mongoose.Types.ObjectId(userId);
}

async function getUploadedFileSensitiveDetections(req) {
  const fileIds = getRequestFileIds(req);
  if (fileIds.length === 0) {
    return [];
  }

  const filter = { file_id: { $in: fileIds } };
  const userObjectId = getUserObjectId(req.user?.id);
  if (userObjectId) {
    filter.user = userObjectId;
  }

  return await File.find(filter)
    .select('metadata.sensitiveDetection')
    .lean()
    .then((files) =>
      files
        .map((file) => file?.metadata?.sensitiveDetection)
        .filter((detection) => detection?.totalCount > 0),
    );
}

async function buildCurrentSensitiveDetection(req) {
  const ruleMatchesByCode = new Map();
  addRuleMatches(ruleMatchesByCode, detectSensitiveText(req.body?.text).ruleMatches);

  const fileDetections = await getUploadedFileSensitiveDetections(req);
  for (const detection of fileDetections) {
    addRuleMatches(ruleMatchesByCode, detection.ruleMatches);
  }

  const ruleMatches = Array.from(ruleMatchesByCode.values());
  return {
    ruleMatches,
    source: 'chat_message',
    evaluatedAt: new Date(),
    version: SENSITIVE_DETECTION_VERSION,
    totalCount: ruleMatches.reduce((sum, match) => sum + match.count, 0),
  };
}

function mergeRuleCounts(ruleCounts, detection) {
  const merged = { ...ruleCounts };
  for (const match of detection.ruleMatches) {
    merged[match.ruleCode] = (merged[match.ruleCode] ?? 0) + match.count;
  }
  return merged;
}

function getTriggeredDecisions(decisions) {
  return decisions.filter((decision) => decision.action !== 'none');
}

async function writeSensitivePolicyActivityLog(req, evaluation, policy, currentDetection) {
  const triggeredDecisions = getTriggeredDecisions(evaluation.decisions);
  if (triggeredDecisions.length === 0) {
    return;
  }

  await writeActivityLog({
    actorUserId: req.user?.id,
    actorRole: req.user?.role ?? null,
    actorDepartmentId: req.user?.departmentId ?? null,
    requestIp: req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: getHeaderValue(req.headers?.['user-agent']),
    resourceType: 'message',
    resourceId: req.body?.messageId ?? null,
    action: 'sensitive_information_policy.preflight',
    result: evaluation.action === 'block' ? 'failure' : 'success',
    message: `Sensitive information policy preflight: ${evaluation.action}`,
    metadata: {
      action: evaluation.action,
      currentCount: currentDetection.totalCount,
      triggeredRules: triggeredDecisions.length,
      durationDays: policy.window.durationDays,
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
}

function buildBlockedMessage(req, evaluation, currentDetection) {
  const now = new Date();
  return {
    endpoint: req.body?.endpoint,
    model: req.body?.model,
    iconURL: req.body?.iconURL,
    messageId: req.body?.messageId || randomUUID(),
    conversationId: req.body?.conversationId,
    parentMessageId: req.body?.parentMessageId,
    sender: 'User',
    text: typeof req.body?.text === 'string' ? req.body.text : '',
    isCreatedByUser: true,
    error: false,
    finish_reason: 'sensitive_information_policy_blocked',
    files: Array.isArray(req.body?.files) ? req.body.files : undefined,
    sensitiveDetection: currentDetection,
    metadata: {
      sensitiveInformationPolicy: {
        blocked: true,
        action: evaluation.action,
        evaluatedAt: now,
        decisions: evaluation.decisions,
      },
    },
  };
}

async function persistBlockedSensitiveMessage(req, evaluation, currentDetection) {
  const userId = req.user?.id;
  if (!userId || !req.body?.conversationId) {
    return;
  }

  const blockedMessage = buildBlockedMessage(req, evaluation, currentDetection);
  await Message.findOneAndUpdate(
    { messageId: blockedMessage.messageId, user: userId },
    {
      ...blockedMessage,
      user: userId,
      expiredAt: null,
    },
    { upsert: true, new: true },
  );
}

async function evaluateSensitiveInformationPolicyPreflight(req) {
  const policy = await getStoredSensitiveInformationPolicySystemSetting();
  if (!policy.enabled) {
    return { allowed: true, action: 'none' };
  }

  const currentDetection = await buildCurrentSensitiveDetection(req);
  if (currentDetection.totalCount <= 0) {
    return { allowed: true, action: 'none' };
  }

  req._sensitiveInformationPolicyPreflightEvaluated = true;

  const userId = req.user?.id;
  const endAt = new Date();
  const startAt = getSensitiveInformationWindowStartDate(policy.window.durationDays, endAt);
  const historicalRuleCounts = await getSensitiveInformationDailyRuleCounts({
    userId,
    startAt,
    endAt,
  });
  const evaluation = evaluateSensitivePolicy({
    policies: policy.rules,
    ruleCounts: mergeRuleCounts(historicalRuleCounts, currentDetection),
  });

  await writeSensitivePolicyActivityLog(req, evaluation, policy, currentDetection);

  if (evaluation.action === 'block') {
    await persistBlockedSensitiveMessage(req, evaluation, currentDetection);
    await updateSensitiveInformationDailySummary({
      userId,
      departmentId: req.user?.departmentId ?? null,
      detection: currentDetection,
      outcome: 'blocked',
      occurredAt: endAt,
    });
  }

  return {
    allowed: evaluation.action !== 'block',
    action: evaluation.action,
    currentDetection,
    decisions: getTriggeredDecisions(evaluation.decisions),
  };
}

async function enforceSensitiveInformationPolicyPreflight(req, res) {
  try {
    const result = await evaluateSensitiveInformationPolicyPreflight(req);
    if (result.allowed) {
      if (result.action === 'warn') {
        req._sensitiveInformationPolicyWarning = {
          type: 'sensitive_information_policy',
          action: result.action,
          message: 'This message reached the sensitive information warning threshold.',
          decisions: result.decisions,
        };
      }
      return false;
    }

    return res.status(403).json({
      type: 'sensitive_information_policy',
      action: result.action,
      message: 'This message was blocked by the sensitive information policy.',
      decisions: result.decisions,
    });
  } catch (error) {
    logger.error('[enforceSensitiveInformationPolicyPreflight]', error);
    return false;
  }
}

module.exports = {
  enforceSensitiveInformationPolicyPreflight,
};

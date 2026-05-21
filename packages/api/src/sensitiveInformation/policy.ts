import type { SensitiveRuleCode } from './rules';

export type SensitivePolicyAction = 'none' | 'record' | 'warn' | 'block';

export type SensitivePolicyThreshold = {
  minCount: number;
  action: SensitivePolicyAction;
};

export type SensitiveRulePolicy = {
  ruleCode: SensitiveRuleCode;
  thresholds: SensitivePolicyThreshold[];
};

export type SensitivePolicyEvaluationInput = {
  ruleCounts: Partial<Record<SensitiveRuleCode, number>>;
  policies: SensitiveRulePolicy[];
};

export type SensitiveRulePolicyDecision = {
  ruleCode: SensitiveRuleCode;
  count: number;
  action: SensitivePolicyAction;
  threshold?: SensitivePolicyThreshold;
  nextBlockCount?: number;
  remainingToBlock?: number;
};

export type SensitivePolicyEvaluationResult = {
  action: SensitivePolicyAction;
  decisions: SensitiveRulePolicyDecision[];
};

export type SensitiveDetectionSummaryParams = {
  userId: string;
  startAt: Date;
  endAt: Date;
  ruleCodes?: SensitiveRuleCode[];
};

export type SensitiveDetectionRuleSummary = {
  ruleCode: SensitiveRuleCode;
  label: string;
  count: number;
  messageCount: number;
};

export type SensitiveDetectionSummary = {
  userId: string;
  startAt: Date;
  endAt: Date;
  totalCount: number;
  ruleSummaries: SensitiveDetectionRuleSummary[];
};

const ACTION_PRIORITY: Record<SensitivePolicyAction, number> = {
  none: 0,
  record: 1,
  warn: 2,
  block: 3,
};

function compareActions(left: SensitivePolicyAction, right: SensitivePolicyAction): number {
  return ACTION_PRIORITY[left] - ACTION_PRIORITY[right];
}

function normalizeThresholds(thresholds: SensitivePolicyThreshold[]): SensitivePolicyThreshold[] {
  return thresholds
    .filter((threshold) => Number.isInteger(threshold.minCount) && threshold.minCount >= 0)
    .sort((left, right) => left.minCount - right.minCount);
}

function evaluateRulePolicy(
  ruleCode: SensitiveRuleCode,
  count: number,
  thresholds: SensitivePolicyThreshold[],
): SensitiveRulePolicyDecision {
  let matchedThreshold: SensitivePolicyThreshold | undefined;
  const normalizedThresholds = normalizeThresholds(thresholds);

  for (const threshold of normalizedThresholds) {
    if (count >= threshold.minCount) {
      matchedThreshold = threshold;
    }
  }

  const blockThreshold = normalizedThresholds.find((threshold) => threshold.action === 'block');

  return {
    ruleCode,
    count,
    action: matchedThreshold?.action ?? 'none',
    ...(matchedThreshold && { threshold: matchedThreshold }),
    ...(blockThreshold && count < blockThreshold.minCount
      ? {
          nextBlockCount: blockThreshold.minCount,
          remainingToBlock: blockThreshold.minCount - count,
        }
      : {}),
  };
}

export function evaluateSensitivePolicy(
  input: SensitivePolicyEvaluationInput,
): SensitivePolicyEvaluationResult {
  const decisions = input.policies.map((policy) =>
    evaluateRulePolicy(policy.ruleCode, input.ruleCounts[policy.ruleCode] ?? 0, policy.thresholds),
  );

  const action = decisions.reduce<SensitivePolicyAction>(
    (currentAction, decision) =>
      compareActions(decision.action, currentAction) > 0 ? decision.action : currentAction,
    'none',
  );

  return { action, decisions };
}

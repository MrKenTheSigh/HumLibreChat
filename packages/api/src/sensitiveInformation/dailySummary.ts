import mongoose from 'mongoose';
import { createModels } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { SensitiveDetection, SensitiveDetectionRuleMatch } from '@librechat/data-schemas';
import type { SensitiveInformationOutcome } from '@librechat/data-schemas';

const { SensitiveInformationDailySummary } = createModels(mongoose);

type RuleCountSummary = {
  ruleCode: string;
  count: number;
};

type UpdateSensitiveInformationDailySummaryInput = {
  userId: string;
  departmentId?: string | Types.ObjectId | null;
  detection?: SensitiveDetection | null;
  outcome: SensitiveInformationOutcome;
  occurredAt?: Date;
};

type UpdateSensitiveInformationDailySummaryDeltaInput = {
  userId: string;
  departmentId?: string | Types.ObjectId | null;
  previousDetection?: SensitiveDetection | null;
  currentDetection?: SensitiveDetection | null;
  outcome: SensitiveInformationOutcome;
  occurredAt?: Date;
};

type SensitiveInformationDailyRuleSummary = {
  ruleCode: string;
  count: number;
};

export type SensitiveInformationDailySummaryQuery = {
  userId: string;
  startAt: Date;
  endAt: Date;
};

export function getSensitiveInformationDateKey(input: Date): string {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, '0');
  const day = String(input.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getSensitiveInformationWindowStartDate(durationDays: number, endAt = new Date()) {
  const days = Math.max(1, Math.floor(durationDays));
  const start = new Date(endAt);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  return start;
}

function normalizeDepartmentId(
  departmentId?: string | Types.ObjectId | null,
): Types.ObjectId | null {
  if (!departmentId) {
    return null;
  }

  const id = departmentId.toString();
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function getRuleMatches(detection?: SensitiveDetection | null): SensitiveDetectionRuleMatch[] {
  return (detection?.ruleMatches ?? []).filter(
    (match) => match.ruleCode && match.label && Number.isFinite(match.count) && match.count > 0,
  );
}

function getRuleCountMap(
  detection?: SensitiveDetection | null,
): Map<string, SensitiveDetectionRuleMatch> {
  return new Map(getRuleMatches(detection).map((match) => [match.ruleCode, match]));
}

export async function updateSensitiveInformationDailySummary(
  input: UpdateSensitiveInformationDailySummaryInput,
): Promise<void> {
  await updateSensitiveInformationDailySummaryDelta({
    userId: input.userId,
    departmentId: input.departmentId,
    previousDetection: null,
    currentDetection: input.detection,
    outcome: input.outcome,
    occurredAt: input.occurredAt,
  });
}

export async function updateSensitiveInformationDailySummaryDelta(
  input: UpdateSensitiveInformationDailySummaryDeltaInput,
): Promise<void> {
  const previousMatches = getRuleCountMap(input.previousDetection);
  const currentMatches = getRuleCountMap(input.currentDetection);
  const ruleCodes = Array.from(new Set([...previousMatches.keys(), ...currentMatches.keys()]));
  if (ruleCodes.length === 0) {
    return;
  }

  const occurredAt = input.occurredAt ?? new Date();
  const dateKey = getSensitiveInformationDateKey(occurredAt);
  const departmentId = normalizeDepartmentId(input.departmentId);

  await Promise.all(
    ruleCodes.map((ruleCode) => {
      const previousMatch = previousMatches.get(ruleCode);
      const currentMatch = currentMatches.get(ruleCode);
      const countDelta = (currentMatch?.count ?? 0) - (previousMatch?.count ?? 0);
      const messageCountDelta = (currentMatch ? 1 : 0) - (previousMatch ? 1 : 0);
      if (countDelta === 0 && messageCountDelta === 0) {
        return Promise.resolve();
      }

      const label = currentMatch?.label ?? previousMatch?.label ?? ruleCode;
      return SensitiveInformationDailySummary.updateOne(
        {
          dateKey,
          userId: input.userId,
          ruleCode,
        },
        {
          $set: {
            label,
            departmentId,
          },
          $inc: {
            totalCount: countDelta,
            submittedCount: input.outcome === 'submitted' ? countDelta : 0,
            blockedCount: input.outcome === 'blocked' ? countDelta : 0,
            messageCount: messageCountDelta,
            submittedMessageCount: input.outcome === 'submitted' ? messageCountDelta : 0,
            blockedMessageCount: input.outcome === 'blocked' ? messageCountDelta : 0,
          },
        },
        { upsert: true },
      );
    }),
  );
}

export async function getSensitiveInformationDailyRuleCounts(
  input: SensitiveInformationDailySummaryQuery,
): Promise<Record<string, number>> {
  const startDateKey = getSensitiveInformationDateKey(input.startAt);
  const endDateKey = getSensitiveInformationDateKey(input.endAt);
  const summaries = await SensitiveInformationDailySummary.aggregate<RuleCountSummary>([
    {
      $match: {
        userId: input.userId,
        dateKey: { $gte: startDateKey, $lte: endDateKey },
      },
    },
    {
      $group: {
        _id: '$ruleCode',
        count: { $sum: '$totalCount' },
      },
    },
    {
      $project: {
        _id: 0,
        ruleCode: '$_id',
        count: 1,
      },
    },
  ]);

  return summaries.reduce<Record<string, number>>((counts, summary) => {
    counts[summary.ruleCode] = summary.count;
    return counts;
  }, {});
}

export async function getSensitiveInformationDailySummaries(input: {
  startAt: Date;
  endAt: Date;
  userIds?: string[];
  ruleCode?: string;
  limit: number;
}): Promise<SensitiveInformationDailyRuleSummary[]> {
  const startDateKey = getSensitiveInformationDateKey(input.startAt);
  const endDateKey = getSensitiveInformationDateKey(input.endAt);
  const match: Record<string, unknown> = {
    dateKey: { $gte: startDateKey, $lte: endDateKey },
  };

  if (input.userIds && input.userIds.length > 0) {
    match.userId = { $in: input.userIds };
  }

  if (input.ruleCode) {
    match.ruleCode = input.ruleCode;
  }

  return await SensitiveInformationDailySummary.aggregate<SensitiveInformationDailyRuleSummary>([
    { $match: match },
    {
      $group: {
        _id: '$ruleCode',
        count: { $sum: '$totalCount' },
      },
    },
    {
      $project: {
        _id: 0,
        ruleCode: '$_id',
        count: 1,
      },
    },
    { $sort: { count: -1, ruleCode: 1 } },
    { $limit: input.limit },
  ]);
}

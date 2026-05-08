import mongoose from 'mongoose';
import { createModels, logger } from '@librechat/data-schemas';
import type { TransactionData } from '@librechat/data-schemas';

const { Department, QuotaAccount, QuotaLedgerEntry, QuotaPeriod, User } = createModels(mongoose);

const COMPANY_DEPARTMENT_CODE = 'COMPANY';

type QuotaPeriodRecord = {
  _id: mongoose.Types.ObjectId;
  periodStart: Date;
  periodEnd: Date;
  status: 'draft' | 'active' | 'closed';
};

type QuotaAccountRecord = {
  _id: mongoose.Types.ObjectId;
  periodId: mongoose.Types.ObjectId | string;
  scopeType: 'company' | 'department' | 'user';
  scopeId?: string | null;
  parentAccountId?: mongoose.Types.ObjectId | string | null;
  baseAllocatedCredits: number;
  extraGrantedCredits: number;
  usedCredits: number;
  remainingCredits: number;
  warningThresholds: number[];
  hardLimitEnabled: boolean;
  bufferCredits: number;
};

type QuotaUserRecord = {
  _id: mongoose.Types.ObjectId;
  departmentId?: mongoose.Types.ObjectId | string | null;
};

type QuotaDepartmentRecord = {
  _id: mongoose.Types.ObjectId;
  code: string;
};

export type QuotaAvailabilityResult =
  | {
      canSpend: true;
    }
  | {
      canSpend: false;
      accountId: string;
      scopeType: 'company' | 'department' | 'user';
      remainingCredits: number;
    };

function getTransactionSpentCredits(transactions: TransactionData[]): number {
  return transactions.reduce((total, transaction) => {
    if (
      (transaction.tokenType === 'prompt' || transaction.tokenType === 'completion') &&
      typeof transaction.tokenValue === 'number'
    ) {
      return total + Math.abs(transaction.tokenValue);
    }

    return total;
  }, 0);
}

function getAccountLimitCredits(account: QuotaAccountRecord): number {
  return (account.baseAllocatedCredits ?? 0) + (account.extraGrantedCredits ?? 0);
}

function getAccountUsableRemainingCredits(account: QuotaAccountRecord): number {
  return (
    getAccountLimitCredits(account) + (account.bufferCredits ?? 0) - (account.usedCredits ?? 0)
  );
}

async function getActiveQuotaPeriod(now = new Date()): Promise<QuotaPeriodRecord | null> {
  return QuotaPeriod.findOne({
    status: 'active',
    periodStart: { $lte: now },
    periodEnd: { $gte: now },
  })
    .sort({ periodStart: -1, _id: -1 })
    .lean<QuotaPeriodRecord | null>();
}

async function getUserDepartmentId(userId: string): Promise<string | null> {
  const user = await User.findById(userId)
    .select('_id departmentId')
    .lean<QuotaUserRecord | null>();
  return user?.departmentId?.toString() ?? null;
}

async function isCompanyRootDepartment(departmentId: string): Promise<boolean> {
  const department = await Department.findById(departmentId)
    .select('_id code')
    .lean<QuotaDepartmentRecord | null>();

  return department?.code?.trim().toUpperCase() === COMPANY_DEPARTMENT_CODE;
}

async function findUserStartingAccount(input: {
  periodId: mongoose.Types.ObjectId;
  userId: string;
}): Promise<QuotaAccountRecord | null> {
  const userAccount = await QuotaAccount.findOne({
    periodId: input.periodId,
    scopeType: 'user',
    scopeId: input.userId,
  }).lean<QuotaAccountRecord | null>();

  if (userAccount) {
    return userAccount;
  }

  const departmentId = await getUserDepartmentId(input.userId);
  if (!departmentId) {
    return null;
  }

  if (await isCompanyRootDepartment(departmentId)) {
    return QuotaAccount.findOne({
      periodId: input.periodId,
      scopeType: 'company',
      scopeId: 'company',
    }).lean<QuotaAccountRecord | null>();
  }

  return QuotaAccount.findOne({
    periodId: input.periodId,
    scopeType: 'department',
    scopeId: departmentId,
  }).lean<QuotaAccountRecord | null>();
}

async function buildAccountChain(
  startingAccount: QuotaAccountRecord,
): Promise<QuotaAccountRecord[]> {
  const chain = [startingAccount];
  const seen = new Set([startingAccount._id.toString()]);
  let parentAccountId = startingAccount.parentAccountId?.toString();

  while (parentAccountId) {
    if (seen.has(parentAccountId)) {
      break;
    }

    const parent = await QuotaAccount.findById(parentAccountId).lean<QuotaAccountRecord | null>();
    if (!parent) {
      break;
    }

    chain.push(parent);
    seen.add(parent._id.toString());
    parentAccountId = parent.parentAccountId?.toString();
  }

  return chain;
}

function crossesWarningThreshold(account: QuotaAccountRecord, spentCredits: number): boolean {
  const totalCredits = getAccountLimitCredits(account) + account.bufferCredits;
  if (totalCredits <= 0 || account.warningThresholds.length === 0) {
    return false;
  }

  const previousRatio = account.usedCredits / totalCredits;
  const nextRatio = (account.usedCredits + spentCredits) / totalCredits;
  return account.warningThresholds.some(
    (threshold) => previousRatio < threshold && nextRatio >= threshold,
  );
}

async function deductQuotaAccount(input: {
  account: QuotaAccountRecord;
  periodId: mongoose.Types.ObjectId;
  spentCredits: number;
  sourceId: string | null;
  userId: string;
}) {
  const updatedUsedCredits = (input.account.usedCredits ?? 0) + input.spentCredits;
  const balanceAfter =
    getAccountLimitCredits(input.account) + (input.account.bufferCredits ?? 0) - updatedUsedCredits;
  await QuotaAccount.updateOne(
    { _id: input.account._id },
    {
      $set: {
        usedCredits: updatedUsedCredits,
        remainingCredits: balanceAfter,
      },
    },
  );
  await QuotaLedgerEntry.create({
    periodId: input.periodId,
    accountId: input.account._id,
    entryType: 'usage',
    amount: -input.spentCredits,
    balanceAfter,
    sourceType: 'transaction',
    sourceId: input.sourceId,
    reason: 'Chat usage',
    actorUserId: new mongoose.Types.ObjectId(input.userId),
  });

  if (crossesWarningThreshold(input.account, input.spentCredits)) {
    await QuotaLedgerEntry.create({
      periodId: input.periodId,
      accountId: input.account._id,
      entryType: 'warning',
      amount: 0,
      balanceAfter,
      sourceType: 'system',
      sourceId: input.sourceId,
      reason: 'Quota warning threshold reached',
      actorUserId: new mongoose.Types.ObjectId(input.userId),
    });
  }

  if (input.account.hardLimitEnabled && balanceAfter < 0) {
    await QuotaLedgerEntry.create({
      periodId: input.periodId,
      accountId: input.account._id,
      entryType: 'block',
      amount: 0,
      balanceAfter,
      sourceType: 'system',
      sourceId: input.sourceId,
      reason: 'Quota hard limit exceeded',
      actorUserId: new mongoose.Types.ObjectId(input.userId),
    });
  }
}

export async function checkQuotaAvailability(input: {
  userId: string;
  estimatedCredits?: number;
}): Promise<QuotaAvailabilityResult> {
  const period = await getActiveQuotaPeriod();
  if (!period) {
    return { canSpend: true };
  }

  const startingAccount = await findUserStartingAccount({
    periodId: period._id,
    userId: input.userId,
  });
  if (!startingAccount) {
    return { canSpend: true };
  }

  const estimatedCredits = Math.max(input.estimatedCredits ?? 0, 0);
  const chain = await buildAccountChain(startingAccount);
  const blockedAccount = chain.find(
    (account) =>
      account.hardLimitEnabled && getAccountUsableRemainingCredits(account) < estimatedCredits,
  );

  if (!blockedAccount) {
    return { canSpend: true };
  }

  return {
    canSpend: false,
    accountId: blockedAccount._id.toString(),
    scopeType: blockedAccount.scopeType,
    remainingCredits: getAccountUsableRemainingCredits(blockedAccount),
  };
}

export async function recordQuotaUsageForTransactions(input: {
  userId: string;
  transactions: TransactionData[];
}): Promise<void> {
  try {
    const spentCredits = getTransactionSpentCredits(input.transactions);
    if (spentCredits <= 0) {
      return;
    }

    const period = await getActiveQuotaPeriod();
    if (!period) {
      return;
    }

    const startingAccount = await findUserStartingAccount({
      periodId: period._id,
      userId: input.userId,
    });
    if (!startingAccount) {
      return;
    }

    const sourceId =
      input.transactions.find((transaction) => typeof transaction.messageId === 'string')
        ?.messageId ??
      input.transactions.find((transaction) => typeof transaction.conversationId === 'string')
        ?.conversationId ??
      null;
    const chain = await buildAccountChain(startingAccount);

    for (const account of chain) {
      await deductQuotaAccount({
        account,
        periodId: period._id,
        spentCredits,
        sourceId,
        userId: input.userId,
      });
    }
  } catch (error) {
    logger.error('[recordQuotaUsageForTransactions]', error);
  }
}

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createModels } from './index';

let mongoServer: MongoMemoryServer;
let QuotaPeriod: mongoose.Model<t.IQuotaPeriod>;
let QuotaAccount: mongoose.Model<t.IQuotaAccount>;
let QuotaLedgerEntry: mongoose.Model<t.IQuotaLedgerEntry>;
let QuotaAllocation: mongoose.Model<t.IQuotaAllocation>;
let QuotaGrant: mongoose.Model<t.IQuotaGrant>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    instance: {
      launchTimeout: 30000,
    },
  });
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  QuotaPeriod = models.QuotaPeriod as mongoose.Model<t.IQuotaPeriod>;
  QuotaAccount = models.QuotaAccount as mongoose.Model<t.IQuotaAccount>;
  QuotaLedgerEntry = models.QuotaLedgerEntry as mongoose.Model<t.IQuotaLedgerEntry>;
  QuotaAllocation = models.QuotaAllocation as mongoose.Model<t.IQuotaAllocation>;
  QuotaGrant = models.QuotaGrant as mongoose.Model<t.IQuotaGrant>;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Promise.all([
    QuotaPeriod.syncIndexes(),
    QuotaAccount.syncIndexes(),
    QuotaLedgerEntry.syncIndexes(),
    QuotaAllocation.syncIndexes(),
    QuotaGrant.syncIndexes(),
  ]);
});

async function createPeriod() {
  return QuotaPeriod.create({
    periodKey: '2026-04',
    timezone: 'Asia/Taipei',
    periodStart: new Date('2026-04-01T00:00:00.000Z'),
    periodEnd: new Date('2026-04-30T15:59:59.999Z'),
    closePolicy: {
      billingDay: 1,
    },
  });
}

describe('Quota models', () => {
  test('stores a quota period and quota account hierarchy', async () => {
    const period = await createPeriod();
    const departmentId = new mongoose.Types.ObjectId();

    const companyAccount = await QuotaAccount.create({
      periodId: period._id,
      scopeType: 'company',
      scopeId: 'company',
      baseAllocatedCredits: 10000,
      remainingCredits: 10000,
    });
    const departmentAccount = await QuotaAccount.create({
      periodId: period._id,
      scopeType: 'department',
      scopeId: departmentId.toString(),
      parentAccountId: companyAccount._id,
      baseAllocatedCredits: 3000,
      remainingCredits: 3000,
    });

    expect(period.status).toBe('draft');
    expect(period.timezone).toBe('Asia/Taipei');
    expect(companyAccount.warningThresholds).toEqual([0.8, 0.9, 1]);
    expect(companyAccount.hardLimitEnabled).toBe(true);
    expect(departmentAccount.parentAccountId?.toString()).toBe(companyAccount._id.toString());
  });

  test('stores allocation, grant, and ledger records for a quota account', async () => {
    const period = await createPeriod();
    const actorUserId = new mongoose.Types.ObjectId();
    const companyAccount = await QuotaAccount.create({
      periodId: period._id,
      scopeType: 'company',
      scopeId: 'company',
      baseAllocatedCredits: 10000,
      remainingCredits: 7000,
    });
    const userAccount = await QuotaAccount.create({
      periodId: period._id,
      scopeType: 'user',
      scopeId: new mongoose.Types.ObjectId().toString(),
      parentAccountId: companyAccount._id,
      baseAllocatedCredits: 1000,
      remainingCredits: 1000,
    });

    const allocation = await QuotaAllocation.create({
      periodId: period._id,
      fromAccountId: companyAccount._id,
      toAccountId: userAccount._id,
      amount: 1000,
      reason: 'Initial user monthly quota',
      actorUserId,
    });
    const grant = await QuotaGrant.create({
      periodId: period._id,
      targetAccountId: userAccount._id,
      requestedByUserId: actorUserId,
      approvedByUserId: actorUserId,
      amount: 200,
      reason: 'Project deadline support',
      status: 'approved',
      expiresAt: period.periodEnd,
    });
    const ledger = await QuotaLedgerEntry.create({
      periodId: period._id,
      accountId: userAccount._id,
      entryType: 'usage',
      amount: -15,
      balanceAfter: 985,
      sourceType: 'transaction',
      sourceId: 'transaction-1',
      reason: 'Chat completion usage',
      actorUserId,
    });

    expect(allocation.status).toBe('active');
    expect(grant.status).toBe('approved');
    expect(grant.expiresAt.toISOString()).toBe(period.periodEnd.toISOString());
    expect(ledger.entryType).toBe('usage');
    expect(ledger.amount).toBe(-15);
  });

  test('prevents duplicate quota accounts for the same period and scope', async () => {
    const period = await createPeriod();

    await QuotaAccount.create({
      periodId: period._id,
      scopeType: 'company',
      scopeId: 'company',
    });

    await expect(
      QuotaAccount.create({
        periodId: period._id,
        scopeType: 'company',
        scopeId: 'company',
      }),
    ).rejects.toThrow();
  });
});

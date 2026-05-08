import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createModels } from './index';

let mongoServer: MongoMemoryServer;
let ManagerReviewBatch: mongoose.Model<t.IManagerReviewBatch>;
let ManagerReviewItem: mongoose.Model<t.IManagerReviewItem>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  ManagerReviewBatch = models.ManagerReviewBatch as mongoose.Model<t.IManagerReviewBatch>;
  ManagerReviewItem = models.ManagerReviewItem as mongoose.Model<t.IManagerReviewItem>;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('Manager review models', () => {
  test('stores a manager review batch and pending review item', async () => {
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const periodStart = new Date('2026-04-20T00:00:00.000Z');
    const periodEnd = new Date('2026-04-21T00:00:00.000Z');

    const batch = await ManagerReviewBatch.create({
      batchKey: 'manager:department:daily:2026-04-20:2026-04-21',
      managerUserId,
      departmentId,
      cadence: 'daily',
      periodStart,
      periodEnd,
      replyTokenHash: 'batch-token-hash',
      itemCount: 1,
      transactionCount: 2,
      totalTokenValue: 10,
      emailTo: 'manager@example.com',
      quotaAllocatedCredits: 100,
      quotaUsedCredits: 35,
      quotaRemainingCredits: 65,
      quotaWarningCount: 1,
    });

    const item = await ManagerReviewItem.create({
      batchId: batch._id,
      managerUserId,
      departmentId,
      userId,
      conversationId: 'conversation-1',
      replyTokenHash: 'item-token-hash',
      transactionCount: 2,
      totalTokenValue: 10,
      totalInputTokens: 6,
      totalWriteTokens: 3,
      totalReadTokens: 1,
      quotaAllocatedCredits: 50,
      quotaUsedCredits: 10,
      quotaRemainingCredits: 40,
    });

    expect(batch.status).toBe('generated');
    expect(batch.responseStatus).toBeNull();
    expect(batch.quotaAllocatedCredits).toBe(100);
    expect(batch.quotaWarningCount).toBe(1);
    expect(item.status).toBe('pending');
    expect(item.riskLevel).toBe('normal');
    expect(item.quotaRemainingCredits).toBe(40);
    expect(item.totalInputTokens + item.totalWriteTokens + item.totalReadTokens).toBe(10);
  });
});

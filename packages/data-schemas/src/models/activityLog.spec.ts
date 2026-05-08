import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createModels } from './index';

let mongoServer: MongoMemoryServer;
let ActivityLog: mongoose.Model<t.IActivityLog>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  ActivityLog = models.ActivityLog as mongoose.Model<t.IActivityLog>;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('ActivityLog model', () => {
  test('uses the legacy auditevents collection to preserve existing records', () => {
    expect(ActivityLog.collection.name).toBe('auditevents');
  });

  test('stores a structured activity log with generated event id', async () => {
    const actorUserId = new mongoose.Types.ObjectId();
    const actorDepartmentId = new mongoose.Types.ObjectId();

    const event = await ActivityLog.create({
      actorUserId,
      actorRole: 'ADMIN',
      actorDepartmentId,
      resourceType: 'department',
      resourceId: 'dep-1',
      action: 'department.create',
      result: 'success',
      message: 'Department created',
      metadata: {
        code: 'IT',
        enabled: true,
      },
      requestIp: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(event.eventId).toHaveLength(24);
    expect(event.actorUserId?.toString()).toBe(actorUserId.toString());
    expect(event.actorRole).toBe('ADMIN');
    expect(event.actorDepartmentId?.toString()).toBe(actorDepartmentId.toString());
    expect(event.resourceType).toBe('department');
    expect(event.action).toBe('department.create');
    expect(event.result).toBe('success');
    expect(event.metadata?.code).toBe('IT');
    expect(event.metadata?.enabled).toBe(true);
  });

  test('requires resource, action, and result fields', async () => {
    await expect(ActivityLog.create({ resourceType: 'user' })).rejects.toThrow();
  });
});

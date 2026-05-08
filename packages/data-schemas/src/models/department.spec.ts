import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createModels } from './index';

let mongoServer: MongoMemoryServer;
let Department: mongoose.Model<t.IDepartment>;
let User: mongoose.Model<t.IUser>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  Department = models.Department as mongoose.Model<t.IDepartment>;
  User = models.User as mongoose.Model<t.IUser>;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('Department model', () => {
  test('stores normalized department metadata', async () => {
    const department = await Department.create({
      code: ' it ',
      name: 'Information Technology',
      description: ' Core systems ',
      sortOrder: 10,
    });

    expect(department.code).toBe('IT');
    expect(department.name).toBe('Information Technology');
    expect(department.description).toBe('Core systems');
    expect(department.enabled).toBe(true);
    expect(department.sortOrder).toBe(10);
    expect(department.parentDepartmentId).toBeNull();
    expect(department.managerUserId).toBeNull();
  });

  test('allows users to reference a department assignment', async () => {
    const department = await Department.create({
      code: 'OPS',
      name: 'Operations',
    });
    const assignedAt = new Date('2026-04-21T00:00:00.000Z');

    const user = await User.create({
      name: 'Ops User',
      email: 'ops@example.com',
      provider: 'local',
      departmentId: department._id,
      departmentAssignedAt: assignedAt,
    });

    expect(user.departmentId?.toString()).toBe(department._id.toString());
    expect(user.departmentAssignedAt?.toISOString()).toBe(assignedAt.toISOString());
  });
});

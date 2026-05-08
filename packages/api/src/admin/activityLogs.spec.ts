import mongoose from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
import type { Request, Response } from 'express';

const mockActivityLogCreate = jest.fn();
const mockActivityLogFind = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    ActivityLog: {
      create: mockActivityLogCreate,
      find: mockActivityLogFind,
    },
  })),
  logger: {
    error: mockLoggerError,
  },
}));

const {
  buildActivityLogFromRequest,
  getAdminActivityLogs,
  writeActivityLog,
} = require('./activityLogs');

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

function createMockResponse(): MockResponse {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json } as unknown as MockResponse;
}

function createActivityLogFindQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('admin activity log handlers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('builds an activity log from the current request', () => {
    const actorUserId = new mongoose.Types.ObjectId();
    const actorDepartmentId = new mongoose.Types.ObjectId();
    const req = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      user: {
        _id: actorUserId,
        role: SystemRoles.ADMIN,
        departmentId: actorDepartmentId,
      },
    } as unknown as Request;

    expect(
      buildActivityLogFromRequest(req, {
        resourceType: 'department',
        resourceId: 'dep-1',
        action: 'department.create',
        result: 'success',
      }),
    ).toEqual({
      actorUserId: actorUserId.toString(),
      actorRole: SystemRoles.ADMIN,
      actorDepartmentId,
      resourceType: 'department',
      resourceId: 'dep-1',
      action: 'department.create',
      result: 'success',
      requestIp: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('writes a structured activity log', async () => {
    const actorUserId = new mongoose.Types.ObjectId();
    const actorDepartmentId = new mongoose.Types.ObjectId();

    await writeActivityLog({
      actorUserId,
      actorRole: SystemRoles.ADMIN,
      actorDepartmentId,
      resourceType: 'role',
      resourceId: 'MANAGER',
      action: 'role.update',
      result: 'success',
      metadata: { roleName: 'MANAGER' },
    });

    expect(mockActivityLogCreate).toHaveBeenCalledWith({
      actorUserId,
      actorRole: SystemRoles.ADMIN,
      actorDepartmentId,
      resourceType: 'role',
      resourceId: 'MANAGER',
      action: 'role.update',
      result: 'success',
      message: '',
      metadata: { roleName: 'MANAGER' },
      requestIp: null,
      userAgent: null,
    });
  });

  it('logs audit write failures without throwing', async () => {
    const error = new Error('write failed');
    mockActivityLogCreate.mockRejectedValue(error);

    await expect(
      writeActivityLog({
        resourceType: 'role',
        action: 'role.update',
        result: 'failure',
      }),
    ).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledWith('[writeActivityLog]', error);
  });

  it('returns filtered activity logs for admins', async () => {
    const eventId = new mongoose.Types.ObjectId();
    const actorUserId = new mongoose.Types.ObjectId();
    mockActivityLogFind.mockReturnValue(
      createActivityLogFindQuery([
        {
          _id: eventId,
          eventId: 'evt_1',
          actorUserId,
          actorRole: SystemRoles.ADMIN,
          resourceType: 'department',
          resourceId: 'dep-1',
          action: 'department.create',
          result: 'success',
          message: 'Department created',
          metadata: { code: 'IT' },
          requestIp: '127.0.0.1',
          userAgent: 'jest',
          createdAt: new Date('2026-04-23T00:00:00.000Z'),
        },
      ]),
    );

    const req = {
      query: {
        actorUserId: actorUserId.toString(),
        resourceType: 'department',
        action: 'department.create',
        result: 'success',
        limit: '25',
      },
      user: { role: SystemRoles.ADMIN },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminActivityLogs(req, res);

    expect(mockActivityLogFind).toHaveBeenCalledWith({
      $and: [
        { actorUserId },
        { resourceType: 'department' },
        { action: 'department.create' },
        { result: 'success' },
      ],
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      events: [
        expect.objectContaining({
          id: eventId.toString(),
          eventId: 'evt_1',
          actorUserId: actorUserId.toString(),
          resourceType: 'department',
          action: 'department.create',
          result: 'success',
          createdAt: '2026-04-23T00:00:00.000Z',
        }),
      ],
      nextCursor: null,
    });
  });

  it('rejects manager access to global activity logs', async () => {
    const req = {
      query: {},
      user: { role: SystemRoles.MANAGER },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminActivityLogs(req, res);

    expect(mockActivityLogFind).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Activity log access role required',
    });
  });
});

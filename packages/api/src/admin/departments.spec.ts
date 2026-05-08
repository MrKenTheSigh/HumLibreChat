import mongoose from 'mongoose';
import type { Request, Response } from 'express';

const mockDepartmentCreate = jest.fn();
const mockDepartmentFind = jest.fn();
const mockDepartmentFindById = jest.fn();
const mockDepartmentFindByIdAndUpdate = jest.fn();
const mockDepartmentFindOne = jest.fn();
const mockUserFindById = jest.fn();
const mockActivityLogCreate = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    Department: {
      create: mockDepartmentCreate,
      find: mockDepartmentFind,
      findById: mockDepartmentFindById,
      findByIdAndUpdate: mockDepartmentFindByIdAndUpdate,
      findOne: mockDepartmentFindOne,
    },
    User: {
      findById: mockUserFindById,
    },
    ActivityLog: {
      create: mockActivityLogCreate,
    },
  })),
  logger: {
    error: mockLoggerError,
  },
}));

const {
  createAdminDepartment,
  disableAdminDepartment,
  getAdminDepartments,
  updateAdminDepartment,
} = require('./departments');

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

function createMockResponse(): MockResponse {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json } as unknown as MockResponse;
}

function createLeanQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function createSelectLeanQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('admin departments handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a sorted department list', async () => {
    const departmentId = new mongoose.Types.ObjectId();
    mockDepartmentFind.mockReturnValue(
      createLeanQuery([
        {
          _id: departmentId,
          code: 'IT',
          name: 'Information Technology',
          description: 'Core systems',
          enabled: true,
          sortOrder: 10,
          createdAt: new Date('2026-04-21T00:00:00.000Z'),
          updatedAt: new Date('2026-04-21T01:00:00.000Z'),
        },
      ]),
    );

    const req = { query: { search: 'it', enabled: 'true' } } as unknown as Request;
    const res = createMockResponse();

    await getAdminDepartments(req, res);

    expect(mockDepartmentFind).toHaveBeenCalledWith({
      $and: [
        { $or: [{ code: expect.any(RegExp) }, { name: expect.any(RegExp) }] },
        { enabled: true },
      ],
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      departments: [
        {
          id: departmentId.toString(),
          code: 'IT',
          name: 'Information Technology',
          description: 'Core systems',
          parentDepartmentId: null,
          managerUserId: null,
          enabled: true,
          sortOrder: 10,
          createdAt: '2026-04-21T00:00:00.000Z',
          updatedAt: '2026-04-21T01:00:00.000Z',
        },
      ],
    });
  });

  it('creates a department with manager and parent references', async () => {
    const departmentId = new mongoose.Types.ObjectId();
    const parentDepartmentId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();

    mockDepartmentFindOne.mockReturnValue(createSelectLeanQuery(null));
    mockDepartmentFindById
      .mockReturnValueOnce(createSelectLeanQuery({ _id: parentDepartmentId }))
      .mockReturnValueOnce(
        createSelectLeanQuery({
          _id: departmentId,
          code: 'OPS',
          name: 'Operations',
          description: '',
          parentDepartmentId,
          managerUserId,
          enabled: true,
          sortOrder: 0,
        }),
      );
    mockUserFindById.mockReturnValue(createSelectLeanQuery({ _id: managerUserId }));
    mockDepartmentCreate.mockResolvedValue({ _id: departmentId });

    const req = {
      body: {
        code: 'ops',
        name: 'Operations',
        parentDepartmentId: parentDepartmentId.toString(),
        managerUserId: managerUserId.toString(),
      },
    } as Request;
    const res = createMockResponse();

    await createAdminDepartment(req, res);

    expect(mockDepartmentCreate).toHaveBeenCalledWith({
      code: 'OPS',
      name: 'Operations',
      description: '',
      parentDepartmentId,
      managerUserId,
      enabled: true,
      sortOrder: 0,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects using the same department as its own parent', async () => {
    const departmentId = new mongoose.Types.ObjectId();
    mockDepartmentFindById
      .mockReturnValueOnce(createSelectLeanQuery({ _id: departmentId }))
      .mockReturnValueOnce(createSelectLeanQuery({ _id: departmentId }));

    const req = {
      params: { departmentId: departmentId.toString() },
      body: { parentDepartmentId: departmentId.toString() },
    } as unknown as Request;
    const res = createMockResponse();

    await updateAdminDepartment(req, res);

    expect(mockDepartmentFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Department cannot be its own parent',
    });
  });

  it('disables a department instead of deleting it', async () => {
    const departmentId = new mongoose.Types.ObjectId();
    mockDepartmentFindByIdAndUpdate.mockReturnValue(
      createSelectLeanQuery({
        _id: departmentId,
        code: 'HR',
        name: 'Human Resources',
        enabled: false,
      }),
    );

    const req = { params: { departmentId: departmentId.toString() } } as unknown as Request;
    const res = createMockResponse();

    await disableAdminDepartment(req, res);

    expect(mockDepartmentFindByIdAndUpdate).toHaveBeenCalledWith(
      departmentId,
      { $set: { enabled: false } },
      { new: true },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: departmentId.toString(),
        code: 'HR',
        enabled: false,
      }),
    );
  });
});

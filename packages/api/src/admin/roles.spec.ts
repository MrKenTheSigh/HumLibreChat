import { roleDefaults, SystemRoles } from 'librechat-data-provider';
import type { Request, Response } from 'express';

const mockRoleCreate = jest.fn();
const mockRoleDeleteOne = jest.fn();
const mockRoleFind = jest.fn();
const mockRoleFindById = jest.fn();
const mockRoleFindOne = jest.fn();
const mockRoleFindOneAndUpdate = jest.fn();
const mockUserFindOne = jest.fn();
const mockActivityLogCreate = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    Role: {
      create: mockRoleCreate,
      deleteOne: mockRoleDeleteOne,
      find: mockRoleFind,
      findById: mockRoleFindById,
      findOne: mockRoleFindOne,
      findOneAndUpdate: mockRoleFindOneAndUpdate,
    },
    User: {
      findOne: mockUserFindOne,
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
  createAdminRole,
  deleteAdminRole,
  getAdminRole,
  getAdminRoles,
  updateAdminRole,
} = require('./roles');

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

describe('admin roles handlers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns all roles', async () => {
    mockRoleFind.mockReturnValue(
      createLeanQuery([
        {
          name: 'ADMIN',
          description: 'Built-in administrator role',
          isSystem: true,
          isEditable: false,
          isDeletable: false,
          permissions: { CHAT: { USE: true }, PROMPTS: { USE: true } },
        },
        {
          name: 'ANALYST',
          description: 'Read only',
          isSystem: false,
          isEditable: true,
          isDeletable: true,
          permissions: { PROMPTS: { USE: false } },
        },
      ]),
    );

    const res = createMockResponse();
    await getAdminRoles({} as Request, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      roles: expect.arrayContaining([
        expect.objectContaining({
          name: 'ADMIN',
          description: 'Built-in administrator role',
          isSystem: true,
          isEditable: false,
          isDeletable: false,
          permissions: expect.objectContaining({
            CHAT: { USE: true },
            PROMPTS: expect.objectContaining({ USE: true }),
          }),
        }),
        expect.objectContaining({
          name: 'ANALYST',
          description: 'Read only',
          isSystem: false,
          isEditable: true,
          isDeletable: true,
          permissions: expect.objectContaining({
            CHAT: { USE: true },
            PROMPTS: expect.objectContaining({ USE: false }),
          }),
        }),
        expect.objectContaining({
          name: 'AUDITOR',
          isSystem: true,
          isDeletable: false,
        }),
        expect.objectContaining({
          name: 'MANAGER',
          isSystem: true,
          isDeletable: false,
        }),
      ]),
    });
  });

  it('returns a system role default when it is not stored yet', async () => {
    mockRoleFindOne.mockReturnValue(createSelectLeanQuery(null));

    const res = createMockResponse();
    await getAdminRole(
      { params: { roleName: SystemRoles.MANAGER } } as unknown as Request,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        name: SystemRoles.MANAGER,
        isSystem: true,
        isDeletable: false,
      }),
    );
  });

  it('returns one role by name', async () => {
    mockRoleFindOne.mockReturnValue(
      createSelectLeanQuery({
        name: 'ANALYST',
        description: 'Read only',
        isSystem: false,
        isEditable: true,
        isDeletable: true,
        permissions: { PROMPTS: { USE: false } },
      }),
    );

    const req = { params: { roleName: 'analyst' } } as unknown as Request;
    const res = createMockResponse();
    await getAdminRole(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ANALYST',
        description: 'Read only',
        isSystem: false,
        isEditable: true,
        isDeletable: true,
        permissions: expect.objectContaining({
          CHAT: { USE: true },
          PROMPTS: expect.objectContaining({ USE: false }),
        }),
      }),
    );
  });

  it('creates a custom role', async () => {
    mockRoleFindOne.mockReturnValue(createSelectLeanQuery(null));
    mockRoleCreate.mockResolvedValue({ _id: 'role-1' });
    mockRoleFindById.mockReturnValue(
      createSelectLeanQuery({
        name: 'ANALYST',
        description: 'Read only',
        isSystem: false,
        isEditable: true,
        isDeletable: true,
        permissions: { PROMPTS: { USE: true, CREATE: false, SHARE: false, SHARE_PUBLIC: false } },
      }),
    );

    const req = {
      body: {
        name: 'analyst',
        description: 'Read only',
        permissions: roleDefaults[SystemRoles.USER].permissions,
      },
    } as Request;
    const res = createMockResponse();

    await createAdminRole(req, res);

    expect(mockRoleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ANALYST',
        description: 'Read only',
        isSystem: false,
        isEditable: true,
        isDeletable: true,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updates an editable role', async () => {
    mockRoleFindOne.mockReturnValueOnce(
      createSelectLeanQuery({
        name: 'ANALYST',
        isEditable: true,
      }),
    );
    mockRoleFindOneAndUpdate.mockReturnValue(
      createSelectLeanQuery({
        name: 'ANALYST',
        description: 'Updated',
        isSystem: false,
        isEditable: true,
        isDeletable: true,
        permissions: { CHAT: { USE: true }, PROMPTS: { USE: true } },
      }),
    );

    const req = {
      params: { roleName: 'analyst' },
      body: { description: 'Updated' },
    } as unknown as Request;
    const res = createMockResponse();

    await updateAdminRole(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ANALYST',
        description: 'Updated',
        isSystem: false,
        isEditable: true,
        isDeletable: true,
        permissions: expect.objectContaining({
          CHAT: { USE: true },
          PROMPTS: expect.objectContaining({ USE: true }),
        }),
      }),
    );
  });

  it('rejects deleting ADMIN', async () => {
    mockRoleFindOne.mockReturnValue(
      createSelectLeanQuery({
        name: 'ADMIN',
        isDeletable: false,
      }),
    );

    const req = { params: { roleName: 'ADMIN' } } as unknown as Request;
    const res = createMockResponse();

    await deleteAdminRole(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'This role cannot be deleted' });
  });

  it('rejects deleting a role that is assigned to users', async () => {
    mockRoleFindOne.mockReturnValue(
      createSelectLeanQuery({
        name: 'ANALYST',
        isDeletable: true,
      }),
    );
    mockUserFindOne.mockReturnValue(createSelectLeanQuery({ _id: 'user-1' }));

    const req = { params: { roleName: 'ANALYST' } } as unknown as Request;
    const res = createMockResponse();

    await deleteAdminRole(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot delete a role that is assigned to users',
    });
  });
});

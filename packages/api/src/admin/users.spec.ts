import mongoose from 'mongoose';
import type { Request, Response } from 'express';

const mockUserFind = jest.fn();
const mockUserFindOne = jest.fn();
const mockUserFindById = jest.fn();
const mockUserFindByIdAndUpdate = jest.fn();
const mockUserCountDocuments = jest.fn();
const mockRoleFindOne = jest.fn();
const mockBalanceFindOne = jest.fn();
const mockBalanceFindOneAndUpdate = jest.fn();
const mockAdminPlanFindById = jest.fn();
const mockTransactionCreate = jest.fn();
const mockCreateUser = jest.fn();
const mockUpdateBalance = jest.fn();
const mockLoggerError = jest.fn();
const mockGetBalanceConfig = jest.fn();
const mockApplyStartingCredits = jest.fn();
const mockResolveProvisioningState = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    User: {
      db: {
        model: jest.fn(() => ({
          findById: mockAdminPlanFindById,
        })),
      },
      find: mockUserFind,
      findOne: mockUserFindOne,
      findById: mockUserFindById,
      findByIdAndUpdate: mockUserFindByIdAndUpdate,
      countDocuments: mockUserCountDocuments,
    },
    Role: {
      findOne: mockRoleFindOne,
    },
    Balance: {
      findOne: mockBalanceFindOne,
      findOneAndUpdate: mockBalanceFindOneAndUpdate,
    },
    Transaction: {
      create: mockTransactionCreate,
    },
  })),
  createMethods: jest.fn(() => ({
    createUser: mockCreateUser,
    updateBalance: mockUpdateBalance,
  })),
  logger: {
    error: mockLoggerError,
  },
}));

jest.mock('~/app/config', () => ({
  getBalanceConfig: (...args: unknown[]) => mockGetBalanceConfig(...args),
}));

jest.mock('./provisioning', () => ({
  applyStartingCredits: (...args: unknown[]) => mockApplyStartingCredits(...args),
  resolveProvisioningState: (...args: unknown[]) => mockResolveProvisioningState(...args),
}));

const {
  applyAdminUserPlanStartingCredits,
  createAdminUser,
  addAdminUserBalance,
  assignAdminUserPlan,
  clearAdminUserPlan,
  getAdminUser,
  getAdminUsers,
  setAdminUserBalance,
  updateAdminUserRole,
} = require('./users');

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
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function createSelectLeanQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('admin users handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFind.mockReturnValue(createLeanQuery([]));
    mockGetBalanceConfig.mockReturnValue(null);
    mockApplyStartingCredits.mockResolvedValue({
      applied: false,
      reason: 'no_plan',
      tokenCredits: 0,
      provisioning: {
        balanceEnabled: true,
        hasBalanceRecord: false,
        currentPlanStartingCredits: null,
        appliedAt: null,
        appliedPlanId: null,
        appliedAmount: null,
        appliedSource: null,
        appliedPlanMatchesCurrent: false,
        canApplyStartingCredits: false,
      },
    });
    mockResolveProvisioningState.mockResolvedValue({
      balanceEnabled: true,
      hasBalanceRecord: true,
      currentPlanStartingCredits: 5000,
      appliedAt: null,
      appliedPlanId: null,
      appliedAmount: null,
      appliedSource: null,
      appliedPlanMatchesCurrent: false,
      canApplyStartingCredits: true,
    });
    mockRoleFindOne.mockReturnValue(createSelectLeanQuery({ name: 'USER' }));
    mockUserCountDocuments.mockResolvedValue(2);
  });

  describe('getAdminUsers', () => {
    it('returns a paginated user list with filters applied', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFind.mockReturnValue(
        createLeanQuery([
          {
            _id: userId,
            name: 'Admin User',
            username: 'admin',
            email: 'admin@example.com',
            role: 'ADMIN',
            provider: 'local',
            emailVerified: true,
            twoFactorEnabled: true,
            createdAt: new Date('2026-03-25T00:00:00.000Z'),
            updatedAt: new Date('2026-03-25T01:00:00.000Z'),
          },
        ]),
      );

      const req = {
        query: {
          search: 'admin',
          role: 'ADMIN',
          provider: 'local',
          emailVerified: 'true',
        },
      } as unknown as Request;
      const res = createMockResponse();

      await getAdminUsers(req, res);

      expect(mockUserFind).toHaveBeenCalledTimes(1);
      const query = mockUserFind.mock.calls[0][0];
      expect(query.$and).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'ADMIN' }),
          expect.objectContaining({ provider: 'local' }),
          expect.objectContaining({ emailVerified: true }),
          expect.objectContaining({
            $or: expect.arrayContaining([
              expect.objectContaining({ email: expect.any(RegExp) }),
              expect.objectContaining({ name: expect.any(RegExp) }),
              expect.objectContaining({ username: expect.any(RegExp) }),
            ]),
          }),
        ]),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        users: [
          {
            id: userId.toString(),
            name: 'Admin User',
            username: 'admin',
            email: 'admin@example.com',
            role: 'ADMIN',
            provider: 'local',
            emailVerified: true,
            twoFactorEnabled: true,
            createdAt: '2026-03-25T00:00:00.000Z',
            updatedAt: '2026-03-25T01:00:00.000Z',
          },
        ],
        nextCursor: null,
      });
    });
  });

  describe('createAdminUser', () => {
    it('creates a local user and returns a sanitized summary', async () => {
      const createdId = new mongoose.Types.ObjectId();
      mockUserFindOne.mockReturnValue(createSelectLeanQuery(null));
      mockCreateUser.mockResolvedValue({
        _id: createdId,
        name: 'New User',
        username: 'new-user',
        email: 'new@example.com',
        role: 'USER',
        provider: 'local',
        emailVerified: true,
        twoFactorEnabled: false,
        createdAt: new Date('2026-03-26T08:00:00.000Z'),
        updatedAt: new Date('2026-03-26T08:00:00.000Z'),
      });

      const req = {
        body: {
          name: 'New User',
          username: 'new-user',
          email: 'new@example.com',
          password: 'Password123',
          role: 'USER',
          emailVerified: true,
        },
        config: {
          balance: {
            enabled: true,
            startBalance: 20000,
          },
        },
      } as unknown as Request;
      const res = createMockResponse();

      await createAdminUser(req, res);

      expect(mockUserFindOne).toHaveBeenCalledWith({
        $or: [{ email: 'new@example.com' }, { username: 'new-user' }],
      });
      expect(mockGetBalanceConfig).toHaveBeenCalledWith(req.config);
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'local',
          email: 'new@example.com',
          username: 'new-user',
          name: 'New User',
          role: 'USER',
          emailVerified: true,
          password: expect.any(String),
        }),
        null,
        true,
        true,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        id: createdId.toString(),
        name: 'New User',
        username: 'new-user',
        email: 'new@example.com',
        role: 'USER',
        provider: 'local',
        emailVerified: true,
        twoFactorEnabled: false,
        createdAt: '2026-03-26T08:00:00.000Z',
        updatedAt: '2026-03-26T08:00:00.000Z',
      });
    });

    it('returns 409 when email or username already exists', async () => {
      mockUserFindOne.mockReturnValue(
        createSelectLeanQuery({
          _id: new mongoose.Types.ObjectId(),
        }),
      );
      const req = {
        body: {
          name: 'Existing User',
          username: 'existing',
          email: 'existing@example.com',
          password: 'Password123',
        },
      } as unknown as Request;
      const res = createMockResponse();

      await createAdminUser(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        message: 'A user with that email or username already exists',
      });
      expect(mockCreateUser).not.toHaveBeenCalled();
    });
  });

  describe('getAdminUser', () => {
    it('returns a sanitized user detail payload', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          name: 'Test User',
          username: 'tester',
          email: 'tester@example.com',
          role: 'USER',
          provider: 'local',
          emailVerified: false,
          twoFactorEnabled: true,
          termsAccepted: true,
          favorites: [{ model: 'gpt-4o' }, { endpoint: 'azureOpenAI' }],
          adminPlanId: new mongoose.Types.ObjectId(),
          adminPlanAssignedAt: new Date('2026-03-25T02:00:00.000Z'),
          personalization: { memories: false },
          plugins: ['web'],
          password: 'should-not-leak',
          backupCodes: ['secret'],
          createdAt: new Date('2026-03-25T00:00:00.000Z'),
          updatedAt: new Date('2026-03-25T01:00:00.000Z'),
        }),
      );
      mockBalanceFindOne.mockReturnValue(
        createSelectLeanQuery({
          tokenCredits: 12345,
        }),
      );
      mockAdminPlanFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: new mongoose.Types.ObjectId(),
          name: 'Pro',
          slug: 'pro',
        }),
      );

      const req = {
        params: {
          userId: userId.toString(),
        },
      } as unknown as Request;
      const res = createMockResponse();

      await getAdminUser(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload).toMatchObject({
        id: userId.toString(),
        email: 'tester@example.com',
        favoritesCount: 2,
        plugins: ['web'],
        roleManagement: {
          isPrimaryAdminProtected: false,
          canChangeRole: true,
          canDelete: true,
        },
        personalization: { memories: false },
        plan: {
          id: expect.any(String),
          name: 'Pro',
          slug: 'pro',
          startingCredits: null,
        },
        planAssignedAt: '2026-03-25T02:00:00.000Z',
        balance: { tokenCredits: 12345, updatedAt: null },
        provisioning: {
          balanceEnabled: true,
          hasBalanceRecord: true,
          currentPlanStartingCredits: 5000,
          appliedAt: null,
          appliedPlanId: null,
          appliedAmount: null,
          appliedSource: null,
          appliedPlanMatchesCurrent: false,
          canApplyStartingCredits: true,
        },
      });
      expect(payload.password).toBeUndefined();
      expect(payload.backupCodes).toBeUndefined();
    });

    it('returns 404 when the user does not exist', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(createSelectLeanQuery(null));

      const req = {
        params: {
          userId: userId.toString(),
        },
      } as unknown as Request;
      const res = createMockResponse();

      await getAdminUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    });
  });

  describe('addAdminUserBalance', () => {
    it('returns 400 for invalid amounts', async () => {
      const req = {
        params: {
          userId: new mongoose.Types.ObjectId().toString(),
        },
        body: {
          amount: 0,
        },
      } as unknown as Request;
      const res = createMockResponse();

      await addAdminUserBalance(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'amount must be greater than 0',
      });
      expect(mockUpdateBalance).not.toHaveBeenCalled();
    });

    it('increments the balance and records a transaction', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'user@example.com',
        }),
      );
      mockUpdateBalance.mockResolvedValue({
        tokenCredits: 600,
      });

      const req = {
        params: {
          userId: userId.toString(),
        },
        body: {
          amount: 100,
        },
      } as unknown as Request;
      const res = createMockResponse();

      await addAdminUserBalance(req, res);

      expect(mockUpdateBalance).toHaveBeenCalledWith({
        user: userId.toString(),
        incrementValue: 100,
      });
      expect(mockTransactionCreate).toHaveBeenCalledWith({
        user: userId,
        tokenType: 'credits',
        context: 'admin_add',
        rawAmount: 100,
        tokenValue: 100,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        userId: userId.toString(),
        tokenCredits: 600,
        updatedAt: null,
      });
    });

    it('rejects unknown roles before creating the user', async () => {
      mockRoleFindOne.mockReturnValue(createSelectLeanQuery(null));

      const req = {
        body: {
          name: 'New User',
          email: 'new@example.com',
          password: 'Password123',
          role: 'MISSING_ROLE',
        },
      } as unknown as Request;
      const res = createMockResponse();

      await createAdminUser(req, res);

      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Role not found' });
    });
  });

  describe('setAdminUserBalance', () => {
    it('sets the balance to an exact value', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'user@example.com',
        }),
      );
      mockBalanceFindOne.mockReturnValue(
        createSelectLeanQuery({
          tokenCredits: 150,
        }),
      );
      mockBalanceFindOneAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          tokenCredits: 500,
        }),
      );

      const req = {
        params: {
          userId: userId.toString(),
        },
        body: {
          amount: 500,
        },
      } as unknown as Request;
      const res = createMockResponse();

      await setAdminUserBalance(req, res);

      expect(mockBalanceFindOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        { $set: { tokenCredits: 500 } },
        { upsert: true, new: true },
      );
      expect(mockTransactionCreate).toHaveBeenCalledWith({
        user: userId,
        tokenType: 'credits',
        context: 'admin_set',
        rawAmount: 350,
        tokenValue: 350,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        userId: userId.toString(),
        tokenCredits: 500,
        updatedAt: null,
      });
    });
  });

  describe('assignAdminUserPlan', () => {
    it('assigns a valid plan to a user', async () => {
      const userId = new mongoose.Types.ObjectId();
      const planId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'user@example.com',
        }),
      );
      mockAdminPlanFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: planId,
          name: 'Pro',
          slug: 'pro',
        }),
      );
      mockUserFindByIdAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          adminPlanAssignedAt: new Date('2026-03-26T03:00:00.000Z'),
        }),
      );

      const req = {
        params: {
          userId: userId.toString(),
        },
        body: {
          planId: planId.toString(),
        },
      } as unknown as Request;
      const res = createMockResponse();

      await assignAdminUserPlan(req, res);

      expect(mockApplyStartingCredits).toHaveBeenCalledWith({
        appConfig: undefined,
        userId,
        source: 'plan_assignment_auto_seed',
        onlyIfNoBalanceRecord: true,
      });
      expect(mockUserFindByIdAndUpdate).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        userId: userId.toString(),
        plan: {
          id: planId.toString(),
          name: 'Pro',
          slug: 'pro',
        },
        assignedAt: '2026-03-26T03:00:00.000Z',
      });
    });

    it('returns 404 for unknown plans', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'user@example.com',
        }),
      );
      mockAdminPlanFindById.mockReturnValue(createSelectLeanQuery(null));

      const req = {
        params: {
          userId: userId.toString(),
        },
        body: {
          planId: new mongoose.Types.ObjectId().toString(),
        },
      } as unknown as Request;
      const res = createMockResponse();

      await assignAdminUserPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Plan not found' });
    });
  });

  describe('clearAdminUserPlan', () => {
    it('clears the assigned plan from a user', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'user@example.com',
        }),
      );
      mockUserFindByIdAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
        }),
      );

      const req = {
        params: {
          userId: userId.toString(),
        },
      } as unknown as Request;
      const res = createMockResponse();

      await clearAdminUserPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        userId: userId.toString(),
        plan: null,
        assignedAt: null,
      });
    });
  });

  describe('applyAdminUserPlanStartingCredits', () => {
    it('returns the provisioning result from the helper', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'user@example.com',
        }),
      );
      mockApplyStartingCredits.mockResolvedValue({
        applied: true,
        reason: 'applied',
        tokenCredits: 5000,
        provisioning: {
          balanceEnabled: true,
          hasBalanceRecord: true,
          currentPlanStartingCredits: 5000,
          appliedAt: '2026-03-26T03:00:00.000Z',
          appliedPlanId: new mongoose.Types.ObjectId().toString(),
          appliedAmount: 5000,
          appliedSource: 'admin_manual_apply',
          appliedPlanMatchesCurrent: true,
          canApplyStartingCredits: false,
        },
      });

      const req = {
        params: {
          userId: userId.toString(),
        },
      } as unknown as Request;
      const res = createMockResponse();

      await applyAdminUserPlanStartingCredits(req, res);

      expect(mockApplyStartingCredits).toHaveBeenCalledWith({
        appConfig: undefined,
        userId,
        source: 'admin_manual_apply',
        onlyIfNoBalanceRecord: false,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        applied: true,
        reason: 'applied',
        tokenCredits: 5000,
        provisioning: {
          balanceEnabled: true,
          hasBalanceRecord: true,
          currentPlanStartingCredits: 5000,
          appliedAt: '2026-03-26T03:00:00.000Z',
          appliedPlanId: expect.any(String),
          appliedAmount: 5000,
          appliedSource: 'admin_manual_apply',
          appliedPlanMatchesCurrent: true,
          canApplyStartingCredits: false,
        },
      });
    });
  });

  describe('updateAdminUserRole', () => {
    it('updates a user to a custom role', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValueOnce(createSelectLeanQuery({ _id: userId, email: 'user@example.com' }));
      mockRoleFindOne.mockReturnValueOnce(createSelectLeanQuery({ name: 'MEMBER' }));
      mockUserFindByIdAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          role: 'MEMBER',
        }),
      );

      const req = {
        params: {
          userId: userId.toString(),
        },
        body: {
          roleName: 'member',
        },
      } as unknown as Request;
      const res = createMockResponse();

      await updateAdminUserRole(req, res);

      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        {
          $set: {
            role: 'MEMBER',
          },
        },
        { new: true },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        userId: userId.toString(),
        role: 'MEMBER',
      });
    });

    it('rejects demoting the last remaining admin user', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById
        .mockReturnValueOnce(createSelectLeanQuery({ _id: userId, email: 'admin@example.com' }))
        .mockReturnValueOnce(createSelectLeanQuery({ _id: userId, role: 'ADMIN' }));
      mockRoleFindOne.mockReturnValueOnce(createSelectLeanQuery({ name: 'MEMBER' }));
      mockUserCountDocuments.mockResolvedValueOnce(1);

      const req = {
        params: {
          userId: userId.toString(),
        },
        body: {
          roleName: 'MEMBER',
        },
      } as unknown as Request;
      const res = createMockResponse();

      await updateAdminUserRole(req, res);

      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Cannot remove the last remaining ADMIN user',
      });
    });

    it('rejects changing the role of the primary admin user', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById
        .mockReturnValueOnce(createSelectLeanQuery({ _id: userId, email: 'admin@example.com' }))
        .mockReturnValueOnce(createSelectLeanQuery({ _id: userId, role: 'ADMIN' }));
      mockRoleFindOne.mockReturnValueOnce(createSelectLeanQuery({ name: 'MEMBER' }));
      mockUserFind.mockReturnValueOnce(
        createLeanQuery([
          {
            _id: userId,
          },
        ]),
      );

      const req = {
        params: {
          userId: userId.toString(),
        },
        body: {
          roleName: 'MEMBER',
        },
      } as unknown as Request;
      const res = createMockResponse();

      await updateAdminUserRole(req, res);

      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Cannot change the role of the primary ADMIN user',
      });
    });
  });
});

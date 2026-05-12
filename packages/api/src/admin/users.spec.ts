import mongoose from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
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
const mockDepartmentFindById = jest.fn();
const mockDepartmentFindOne = jest.fn();
const mockQuotaPeriodFindOne = jest.fn();
const mockQuotaPeriodFindById = jest.fn();
const mockQuotaAccountFindOne = jest.fn();
const mockQuotaAccountFindById = jest.fn();
const mockQuotaAccountUpdateOne = jest.fn();
const mockQuotaLedgerEntryCreate = jest.fn();
const mockTransactionCreate = jest.fn();
const mockActivityLogCreate = jest.fn();
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
    Department: {
      findById: mockDepartmentFindById,
      findOne: mockDepartmentFindOne,
    },
    QuotaPeriod: {
      findOne: mockQuotaPeriodFindOne,
      findById: mockQuotaPeriodFindById,
    },
    QuotaAccount: {
      findOne: mockQuotaAccountFindOne,
      findById: mockQuotaAccountFindById,
      updateOne: mockQuotaAccountUpdateOne,
    },
    QuotaLedgerEntry: {
      create: mockQuotaLedgerEntryCreate,
    },
    ActivityLog: {
      create: mockActivityLogCreate,
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

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  applyAdminUserPlanStartingCredits,
  createAdminUser,
  addAdminUserBalance,
  assignAdminUserPlan,
  clearAdminUserPlan,
  getAdminUser,
  getAdminUsers,
  setAdminUserBalance,
  updateAdminUser,
  updateAdminUserDepartment,
  updateAdminUserRole,
} = require('./users');
/* eslint-enable @typescript-eslint/no-require-imports */

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
    mockDepartmentFindById.mockReturnValue(createSelectLeanQuery(null));
    mockDepartmentFindOne.mockReturnValue(createSelectLeanQuery(null));
    mockQuotaPeriodFindOne.mockReturnValue(createLeanQuery(null));
    mockQuotaPeriodFindById.mockReturnValue(createSelectLeanQuery(null));
    mockQuotaAccountFindOne.mockReturnValue(createSelectLeanQuery(null));
    mockQuotaAccountFindById.mockReturnValue(createSelectLeanQuery(null));
    mockQuotaAccountUpdateOne.mockResolvedValue({});
    mockQuotaLedgerEntryCreate.mockResolvedValue({});
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
            departmentId: null,
            emailVerified: true,
            twoFactorEnabled: true,
            createdAt: new Date('2026-03-25T00:00:00.000Z'),
            updatedAt: new Date('2026-03-25T01:00:00.000Z'),
          },
        ]),
      );

      const req = {
        user: { role: SystemRoles.ADMIN },
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
            departmentId: null,
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
        username: 'new',
        email: 'new@example.com',
        role: 'USER',
        provider: 'local',
        departmentId: null,
        emailVerified: true,
        twoFactorEnabled: false,
        createdAt: new Date('2026-03-26T08:00:00.000Z'),
        updatedAt: new Date('2026-03-26T08:00:00.000Z'),
      });

      const req = {
        body: {
          name: 'New User',
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
        $or: [{ email: 'new@example.com' }, { username: 'new' }],
      });
      expect(mockGetBalanceConfig).toHaveBeenCalledWith(req.config);
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'local',
          email: 'new@example.com',
          username: 'new',
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
        username: 'new',
        email: 'new@example.com',
        role: 'USER',
        provider: 'local',
        departmentId: null,
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
          departmentId: new mongoose.Types.ObjectId(),
          departmentAssignedAt: new Date('2026-03-25T03:00:00.000Z'),
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
          tokenCredits: 500,
          tokenCreditsLimit: 900,
          planTokenCredits: 200,
          planTokenCreditsLimit: 200,
        }),
      );
      mockBalanceFindOneAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          tokenCredits: 12345,
          tokenCreditsLimit: 20000,
          planTokenCredits: 0,
          planTokenCreditsLimit: 0,
        }),
      );
      mockAdminPlanFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: new mongoose.Types.ObjectId(),
          name: 'Pro',
          slug: 'pro',
        }),
      );
      mockDepartmentFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: new mongoose.Types.ObjectId(),
          code: 'IT',
          name: 'Information Technology',
          enabled: true,
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
        department: {
          id: expect.any(String),
          code: 'IT',
          name: 'Information Technology',
          enabled: true,
        },
        departmentAssignedAt: '2026-03-25T03:00:00.000Z',
        balance: { tokenCredits: 500, updatedAt: null },
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

  describe('updateAdminUser', () => {
    it('updates the user name and returns a sanitized summary', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'tester@example.com',
        }),
      );
      mockUserFindByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: userId,
          name: 'Renamed User',
          username: 'tester',
          email: 'tester@example.com',
          role: 'USER',
          provider: 'local',
          emailVerified: true,
          twoFactorEnabled: false,
          createdAt: new Date('2026-03-25T00:00:00.000Z'),
          updatedAt: new Date('2026-03-26T00:00:00.000Z'),
        }),
      });

      const req = {
        params: {
          userId: userId.toString(),
        },
        body: {
          name: 'Renamed User',
        },
      } as unknown as Request;
      const res = createMockResponse();

      await updateAdminUser(req, res);

      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: { name: 'Renamed User' } },
        { new: true },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        id: userId.toString(),
        name: 'Renamed User',
        username: 'tester',
        email: 'tester@example.com',
        role: 'USER',
        provider: 'local',
        departmentId: null,
        emailVerified: true,
        twoFactorEnabled: false,
        createdAt: '2026-03-25T00:00:00.000Z',
        updatedAt: '2026-03-26T00:00:00.000Z',
      });
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
      mockBalanceFindOne.mockReturnValue(
        createSelectLeanQuery({
          tokenCredits: 500,
          tokenCreditsLimit: 1000,
          planTokenCredits: 200,
          planTokenCreditsLimit: 200,
        }),
      );
      mockBalanceFindOneAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          tokenCredits: 600,
          tokenCreditsLimit: 1100,
          planTokenCredits: 200,
          planTokenCreditsLimit: 200,
        }),
      );

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

      expect(mockBalanceFindOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        {
          $set: {
            tokenCredits: 600,
            tokenCreditsLimit: 1100,
            planTokenCredits: 200,
            planTokenCreditsLimit: 200,
          },
        },
        { new: true, upsert: true },
      );
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
          tokenCreditsLimit: 300,
          planTokenCredits: 50,
          planTokenCreditsLimit: 50,
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
        { $set: { tokenCredits: 500, tokenCreditsLimit: 500, planTokenCredits: 50 } },
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
      mockGetBalanceConfig.mockReturnValue({ enabled: true });
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
          startingCredits: 5000,
        }),
      );
      mockBalanceFindOne.mockReturnValue(
        createSelectLeanQuery({
          tokenCredits: 900,
          tokenCreditsLimit: 1200,
          planTokenCredits: 0,
          planTokenCreditsLimit: 0,
        }),
      );
      mockUserFindByIdAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          adminPlanAssignedAt: new Date('2026-03-26T03:00:00.000Z'),
        }),
      );
      mockBalanceFindOneAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          tokenCredits: 5900,
          tokenCreditsLimit: 6200,
          planTokenCredits: 5000,
          planTokenCreditsLimit: 5000,
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

      expect(mockBalanceFindOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        {
          $set: {
            tokenCredits: 5900,
            tokenCreditsLimit: 6200,
            planTokenCredits: 5000,
            planTokenCreditsLimit: 5000,
          },
        },
        { upsert: true, new: true },
      );
      expect(mockApplyStartingCredits).not.toHaveBeenCalled();
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

    it('assigns a plan without updating legacy balance when legacy balance is disabled', async () => {
      const userId = new mongoose.Types.ObjectId();
      const planId = new mongoose.Types.ObjectId();
      mockGetBalanceConfig.mockReturnValue({ enabled: false });
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
          startingCredits: 5000,
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

      expect(mockBalanceFindOne).not.toHaveBeenCalled();
      expect(mockBalanceFindOneAndUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
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
      mockGetBalanceConfig.mockReturnValue({ enabled: true });
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'user@example.com',
        }),
      );
      mockBalanceFindOne.mockReturnValue(
        createSelectLeanQuery({
          tokenCredits: 3400,
          tokenCreditsLimit: 8000,
          planTokenCredits: 3000,
          planTokenCreditsLimit: 3000,
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

      expect(mockBalanceFindOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        {
          $set: {
            tokenCredits: 400,
            tokenCreditsLimit: 5000,
            planTokenCredits: 0,
            planTokenCreditsLimit: 0,
          },
        },
        { upsert: true, new: true },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        userId: userId.toString(),
        plan: null,
        assignedAt: null,
      });
    });

    it('clears a plan without updating legacy balance when legacy balance is disabled', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockGetBalanceConfig.mockReturnValue({ enabled: false });
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

      expect(mockBalanceFindOne).not.toHaveBeenCalled();
      expect(mockBalanceFindOneAndUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
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

  describe('updateAdminUserDepartment', () => {
    it('assigns an enabled department to a user', async () => {
      const userId = new mongoose.Types.ObjectId();
      const departmentId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'tester@example.com',
        }),
      );
      mockDepartmentFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: departmentId,
          code: 'IT',
          name: 'Information Technology',
          enabled: true,
        }),
      );
      mockUserFindByIdAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          departmentId,
          departmentAssignedAt: new Date('2026-04-21T00:00:00.000Z'),
        }),
      );

      const req = {
        params: { userId: userId.toString() },
        body: { departmentId: departmentId.toString() },
      } as unknown as Request;
      const res = createMockResponse();

      await updateAdminUserDepartment(req, res);

      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        {
          $set: {
            departmentId,
            departmentAssignedAt: expect.any(Date),
          },
        },
        { new: true },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        userId: userId.toString(),
        department: {
          id: departmentId.toString(),
          code: 'IT',
          name: 'Information Technology',
          enabled: true,
        },
        departmentAssignedAt: '2026-04-21T00:00:00.000Z',
      });
    });

    it('transfers an active user quota account to the new department account', async () => {
      const userId = new mongoose.Types.ObjectId();
      const departmentId = new mongoose.Types.ObjectId();
      const periodId = new mongoose.Types.ObjectId();
      const userAccountId = new mongoose.Types.ObjectId();
      const oldDepartmentAccountId = new mongoose.Types.ObjectId();
      const newDepartmentAccountId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'tester@example.com',
        }),
      );
      mockDepartmentFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: departmentId,
          code: 'IT',
          name: 'Information Technology',
          enabled: true,
        }),
      );
      mockDepartmentFindOne.mockReturnValue(createSelectLeanQuery(null));
      mockQuotaPeriodFindOne.mockReturnValue(createLeanQuery({ _id: periodId }));
      mockQuotaAccountFindOne
        .mockReturnValueOnce(
          createSelectLeanQuery({
            _id: userAccountId,
            parentAccountId: oldDepartmentAccountId,
            baseAllocatedCredits: 100,
            extraGrantedCredits: 0,
            reservedCredits: 0,
            usedCredits: 25,
            bufferCredits: 0,
          }),
        )
        .mockReturnValueOnce(
          createSelectLeanQuery({
            _id: newDepartmentAccountId,
            parentAccountId: null,
            baseAllocatedCredits: 500,
            extraGrantedCredits: 0,
            reservedCredits: 200,
            usedCredits: 0,
            bufferCredits: 0,
          }),
        );
      mockQuotaAccountFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: oldDepartmentAccountId,
          parentAccountId: null,
          baseAllocatedCredits: 300,
          extraGrantedCredits: 0,
          reservedCredits: 150,
          usedCredits: 0,
          bufferCredits: 0,
        }),
      );
      mockUserFindByIdAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          departmentId,
          departmentAssignedAt: new Date('2026-04-21T00:00:00.000Z'),
        }),
      );

      const req = {
        params: { userId: userId.toString() },
        body: { departmentId: departmentId.toString() },
      } as unknown as Request;
      const res = createMockResponse();

      await updateAdminUserDepartment(req, res);

      expect(mockQuotaAccountUpdateOne).toHaveBeenCalledWith(
        { _id: userAccountId },
        { $set: { parentAccountId: newDepartmentAccountId } },
      );
      expect(mockQuotaAccountUpdateOne).toHaveBeenCalledWith(
        { _id: newDepartmentAccountId },
        { $set: { reservedCredits: 300 } },
      );
      expect(mockQuotaAccountUpdateOne).toHaveBeenCalledWith(
        { _id: oldDepartmentAccountId },
        { $set: { reservedCredits: 50 } },
      );
      expect(mockQuotaLedgerEntryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          periodId,
          accountId: userAccountId,
          counterpartyAccountId: newDepartmentAccountId,
          entryType: 'adjustment',
          sourceType: 'admin_action',
          sourceId: userId.toString(),
        }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('uses the requested quota period when transferring a user quota account', async () => {
      const userId = new mongoose.Types.ObjectId();
      const departmentId = new mongoose.Types.ObjectId();
      const periodId = new mongoose.Types.ObjectId();
      const userAccountId = new mongoose.Types.ObjectId();
      const oldDepartmentAccountId = new mongoose.Types.ObjectId();
      const newDepartmentAccountId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'tester@example.com',
        }),
      );
      mockDepartmentFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: departmentId,
          code: 'IT',
          name: 'Information Technology',
          enabled: true,
        }),
      );
      mockDepartmentFindOne.mockReturnValue(createSelectLeanQuery(null));
      mockQuotaPeriodFindById.mockReturnValue(createSelectLeanQuery({ _id: periodId }));
      mockQuotaAccountFindOne
        .mockReturnValueOnce(
          createSelectLeanQuery({
            _id: userAccountId,
            parentAccountId: oldDepartmentAccountId,
            baseAllocatedCredits: 100,
            extraGrantedCredits: 0,
            reservedCredits: 0,
            usedCredits: 0,
            bufferCredits: 0,
          }),
        )
        .mockReturnValueOnce(
          createSelectLeanQuery({
            _id: newDepartmentAccountId,
            parentAccountId: null,
            baseAllocatedCredits: 500,
            extraGrantedCredits: 0,
            reservedCredits: 0,
            usedCredits: 0,
            bufferCredits: 0,
          }),
        );
      mockQuotaAccountFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: oldDepartmentAccountId,
          parentAccountId: null,
          baseAllocatedCredits: 500,
          extraGrantedCredits: 0,
          reservedCredits: 100,
          usedCredits: 0,
          bufferCredits: 0,
        }),
      );
      mockUserFindByIdAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          departmentId,
          departmentAssignedAt: new Date('2026-04-21T00:00:00.000Z'),
        }),
      );

      const req = {
        params: { userId: userId.toString() },
        body: { departmentId: departmentId.toString(), quotaPeriodId: periodId.toString() },
      } as unknown as Request;
      const res = createMockResponse();

      await updateAdminUserDepartment(req, res);

      expect(mockQuotaPeriodFindById).toHaveBeenCalledWith(periodId);
      expect(mockQuotaPeriodFindOne).not.toHaveBeenCalled();
      expect(mockQuotaAccountFindOne).toHaveBeenCalledWith({
        periodId,
        scopeType: 'user',
        scopeId: userId.toString(),
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('rejects department changes when the target quota account has insufficient credits', async () => {
      const userId = new mongoose.Types.ObjectId();
      const departmentId = new mongoose.Types.ObjectId();
      const periodId = new mongoose.Types.ObjectId();
      const userAccountId = new mongoose.Types.ObjectId();
      const oldDepartmentAccountId = new mongoose.Types.ObjectId();
      const newDepartmentAccountId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'tester@example.com',
        }),
      );
      mockDepartmentFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: departmentId,
          code: 'IT',
          name: 'Information Technology',
          enabled: true,
        }),
      );
      mockDepartmentFindOne.mockReturnValue(createSelectLeanQuery(null));
      mockQuotaPeriodFindOne.mockReturnValue(createLeanQuery({ _id: periodId }));
      mockQuotaAccountFindOne
        .mockReturnValueOnce(
          createSelectLeanQuery({
            _id: userAccountId,
            parentAccountId: oldDepartmentAccountId,
            baseAllocatedCredits: 100,
            extraGrantedCredits: 0,
            reservedCredits: 0,
            usedCredits: 0,
            bufferCredits: 0,
          }),
        )
        .mockReturnValueOnce(
          createSelectLeanQuery({
            _id: newDepartmentAccountId,
            parentAccountId: null,
            baseAllocatedCredits: 250,
            extraGrantedCredits: 0,
            reservedCredits: 200,
            usedCredits: 0,
            bufferCredits: 0,
          }),
        );

      const req = {
        params: { userId: userId.toString() },
        body: { departmentId: departmentId.toString() },
      } as unknown as Request;
      const res = createMockResponse();

      await updateAdminUserDepartment(req, res);

      expect(mockQuotaAccountUpdateOne).not.toHaveBeenCalled();
      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Target department has insufficient quota credits',
      });
    });

    it('clears a user department assignment', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'tester@example.com',
        }),
      );
      mockUserFindByIdAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          departmentId: null,
          departmentAssignedAt: null,
        }),
      );

      const req = {
        params: { userId: userId.toString() },
        body: { departmentId: null },
      } as unknown as Request;
      const res = createMockResponse();

      await updateAdminUserDepartment(req, res);

      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        {
          $set: {
            departmentId: null,
            departmentAssignedAt: null,
          },
        },
        { new: true },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        userId: userId.toString(),
        department: null,
        departmentAssignedAt: null,
      });
    });

    it('rejects disabled department assignment', async () => {
      const userId = new mongoose.Types.ObjectId();
      const departmentId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: userId,
          email: 'tester@example.com',
        }),
      );
      mockDepartmentFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: departmentId,
          code: 'OLD',
          name: 'Old Department',
          enabled: false,
        }),
      );

      const req = {
        params: { userId: userId.toString() },
        body: { departmentId: departmentId.toString() },
      } as unknown as Request;
      const res = createMockResponse();

      await updateAdminUserDepartment(req, res);

      expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Cannot assign a disabled department',
      });
    });
  });

  describe('updateAdminUserRole', () => {
    it('updates a user to a custom role', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockUserFindById.mockReturnValueOnce(
        createSelectLeanQuery({ _id: userId, email: 'user@example.com' }),
      );
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

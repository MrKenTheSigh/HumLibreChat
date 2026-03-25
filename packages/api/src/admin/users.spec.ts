import mongoose from 'mongoose';
import type { Request, Response } from 'express';

const mockUserFind = jest.fn();
const mockUserFindById = jest.fn();
const mockBalanceFindOne = jest.fn();
const mockBalanceFindOneAndUpdate = jest.fn();
const mockTransactionCreate = jest.fn();
const mockUpdateBalance = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    User: {
      find: mockUserFind,
      findById: mockUserFindById,
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
    updateBalance: mockUpdateBalance,
  })),
  logger: {
    error: mockLoggerError,
  },
}));

const { addAdminUserBalance, getAdminUser, getAdminUsers, setAdminUserBalance } =
  require('./users');

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
        personalization: { memories: false },
        balance: { tokenCredits: 12345, updatedAt: null },
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
});

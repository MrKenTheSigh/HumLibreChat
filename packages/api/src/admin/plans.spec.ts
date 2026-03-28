import mongoose from 'mongoose';
import type { Request, Response } from 'express';

const mockAdminPlanCreate = jest.fn();
const mockAdminPlanDeleteOne = jest.fn();
const mockAdminPlanFind = jest.fn();
const mockAdminPlanFindById = jest.fn();
const mockAdminPlanFindByIdAndUpdate = jest.fn();
const mockAdminPlanFindOne = jest.fn();
const mockAdminPlanUpdateMany = jest.fn();
const mockLoggerError = jest.fn();
const mockUsersCollectionFindOne = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    AdminPlan: {
      create: mockAdminPlanCreate,
      deleteOne: mockAdminPlanDeleteOne,
      find: mockAdminPlanFind,
      findById: mockAdminPlanFindById,
      findByIdAndUpdate: mockAdminPlanFindByIdAndUpdate,
      findOne: mockAdminPlanFindOne,
      updateMany: mockAdminPlanUpdateMany,
    },
  })),
  logger: {
    error: mockLoggerError,
  },
}));

const {
  createAdminPlan,
  deleteAdminPlan,
  getAdminPlan,
  getAdminPlans,
  updateAdminPlan,
} = require('./plans');

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

describe('admin plans handlers', () => {
  const originalDb = mongoose.connection.db;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(mongoose.connection, 'db', {
      configurable: true,
      value: {
        collection: jest.fn(() => ({
          findOne: mockUsersCollectionFindOne,
        })),
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(mongoose.connection, 'db', {
      configurable: true,
      value: originalDb,
    });
  });

  describe('getAdminPlans', () => {
    it('returns a sorted list of plans', async () => {
      const planId = new mongoose.Types.ObjectId();
      mockAdminPlanFind.mockReturnValue(
        createLeanQuery([
          {
            _id: planId,
            name: 'Pro',
            slug: 'pro',
            description: 'Power users',
            enabled: true,
            isDefault: true,
            sortOrder: 10,
            channelIds: ['channel-1'],
            modelEntitlements: [
              {
                channelId: 'channel-1',
                endpoint: 'azureOpenAI',
                model: 'gpt-4o-mini',
              },
            ],
            notes: 'Manual assignment only',
            startingCredits: 20000,
            createdAt: new Date('2026-03-26T00:00:00.000Z'),
            updatedAt: new Date('2026-03-26T01:00:00.000Z'),
          },
        ]),
      );

      const req = {} as Request;
      const res = createMockResponse();

      await getAdminPlans(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        plans: [
          {
            id: planId.toString(),
            name: 'Pro',
            slug: 'pro',
            description: 'Power users',
            enabled: true,
            isDefault: true,
            sortOrder: 10,
            channelIds: ['channel-1'],
            modelEntitlements: [
              {
                channelId: 'channel-1',
                endpoint: 'azureOpenAI',
                model: 'gpt-4o-mini',
              },
            ],
            notes: 'Manual assignment only',
            startingCredits: 20000,
            createdAt: '2026-03-26T00:00:00.000Z',
            updatedAt: '2026-03-26T01:00:00.000Z',
          },
        ],
      });
    });
  });

  describe('getAdminPlan', () => {
    it('returns 404 when the plan does not exist', async () => {
      mockAdminPlanFindById.mockReturnValue(createSelectLeanQuery(null));

      const req = {
        params: {
          planId: new mongoose.Types.ObjectId().toString(),
        },
      } as unknown as Request;
      const res = createMockResponse();

      await getAdminPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Plan not found' });
    });
  });

  describe('createAdminPlan', () => {
    it('creates a plan and clears previous defaults when needed', async () => {
      const planId = new mongoose.Types.ObjectId();
      mockAdminPlanFindOne.mockReturnValue(createSelectLeanQuery(null));
      mockAdminPlanCreate.mockResolvedValue({ _id: planId });
      mockAdminPlanFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: planId,
          name: 'Pro',
          slug: 'pro',
          description: 'Power users',
          enabled: true,
          isDefault: true,
          sortOrder: 20,
          channelIds: ['channel-1', 'channel-2'],
          modelEntitlements: [
            {
              channelId: 'channel-1',
              endpoint: 'azureOpenAI',
              model: 'gpt-4o-mini',
            },
            {
              channelId: 'channel-2',
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
            },
          ],
          notes: 'Internal users',
          startingCredits: 20000,
          createdAt: new Date('2026-03-26T00:00:00.000Z'),
          updatedAt: new Date('2026-03-26T01:00:00.000Z'),
        }),
      );

      const req = {
        body: {
          name: 'Pro',
          slug: 'PRO',
          description: 'Power users',
          enabled: true,
          isDefault: true,
          sortOrder: 20,
          channelIds: ['channel-1', ' channel-2 ', 'channel-1'],
          modelEntitlements: [
            {
              channelId: 'channel-1',
              endpoint: 'azureOpenAI',
              model: 'gpt-4o-mini',
            },
            {
              channelId: ' channel-2 ',
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
            },
            {
              channelId: 'channel-1',
              endpoint: 'azureOpenAI',
              model: 'gpt-4o-mini',
            },
          ],
          notes: 'Internal users',
          startingCredits: 20000,
        },
      } as Request;
      const res = createMockResponse();

      await createAdminPlan(req, res);

      expect(mockAdminPlanCreate).toHaveBeenCalledWith({
        name: 'Pro',
        slug: 'pro',
        description: 'Power users',
        enabled: true,
        isDefault: true,
        sortOrder: 20,
        channelIds: ['channel-1', 'channel-2'],
        modelEntitlements: [
          {
            channelId: 'channel-1',
            endpoint: 'azureOpenAI',
            model: 'gpt-4o-mini',
          },
          {
            channelId: 'channel-2',
            endpoint: 'azureOpenAI',
            model: 'gpt-4o',
          },
        ],
        notes: 'Internal users',
        startingCredits: 20000,
      });
      expect(mockAdminPlanUpdateMany).toHaveBeenCalledWith(
        { isDefault: true, _id: { $ne: planId } },
        { $set: { isDefault: false } },
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 409 for duplicate slugs', async () => {
      mockAdminPlanFindOne.mockReturnValue(
        createSelectLeanQuery({ _id: new mongoose.Types.ObjectId() }),
      );

      const req = {
        body: {
          name: 'Pro',
          slug: 'pro',
        },
      } as Request;
      const res = createMockResponse();

      await createAdminPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        message: 'A plan with this slug already exists',
      });
    });
  });

  describe('updateAdminPlan', () => {
    it('updates a plan and preserves the default uniqueness rule', async () => {
      const planId = new mongoose.Types.ObjectId();
      mockAdminPlanFindById
        .mockReturnValueOnce(
          createSelectLeanQuery({
            _id: planId,
            name: 'Starter',
            slug: 'starter',
          }),
        )
        .mockReturnValueOnce(
          createSelectLeanQuery({
            _id: planId,
            name: 'Starter Plus',
            slug: 'starter-plus',
            description: '',
            enabled: true,
            isDefault: false,
            sortOrder: 5,
            channelIds: [],
            modelEntitlements: [
              {
                channelId: 'channel-1',
                endpoint: 'azureOpenAI',
                model: 'gpt-4o-mini',
              },
            ],
            notes: '',
            startingCredits: 1000,
            createdAt: new Date('2026-03-26T00:00:00.000Z'),
            updatedAt: new Date('2026-03-26T01:00:00.000Z'),
          }),
        );
      mockAdminPlanFindOne.mockReturnValue(createSelectLeanQuery(null));
      mockAdminPlanFindByIdAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          _id: planId,
        }),
      );

      const req = {
        params: {
          planId: planId.toString(),
        },
        body: {
          name: 'Starter Plus',
          slug: 'starter-plus',
          enabled: true,
          isDefault: false,
          sortOrder: 5,
          channelIds: [],
          modelEntitlements: [
            {
              channelId: 'channel-1',
              endpoint: 'azureOpenAI',
              model: 'gpt-4o-mini',
            },
          ],
          notes: '',
          startingCredits: 1000,
        },
      } as unknown as Request;
      const res = createMockResponse();

      await updateAdminPlan(req, res);

      expect(mockAdminPlanFindByIdAndUpdate).toHaveBeenCalledWith(
        planId,
        {
          $set: {
            name: 'Starter Plus',
            slug: 'starter-plus',
            description: '',
            enabled: true,
            isDefault: false,
            sortOrder: 5,
            channelIds: ['channel-1'],
            modelEntitlements: [
              {
                channelId: 'channel-1',
                endpoint: 'azureOpenAI',
                model: 'gpt-4o-mini',
              },
            ],
            notes: '',
            startingCredits: 1000,
          },
        },
        { new: true },
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('deleteAdminPlan', () => {
    it('returns 409 when the plan is assigned to users', async () => {
      const planId = new mongoose.Types.ObjectId();
      mockAdminPlanFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: planId,
          name: 'Pro',
          slug: 'pro',
        }),
      );
      mockUsersCollectionFindOne.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      const req = {
        params: {
          planId: planId.toString(),
        },
      } as unknown as Request;
      const res = createMockResponse();

      await deleteAdminPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Cannot delete a plan that is assigned to users',
      });
      expect(mockAdminPlanDeleteOne).not.toHaveBeenCalled();
    });
  });
});

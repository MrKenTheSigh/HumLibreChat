import mongoose from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
import { createGetUserEntitlements, createResolveUserEntitlements, isPairAllowed } from './access';

type MockLoaders = Parameters<typeof createResolveUserEntitlements>[0];

function createLoaders(overrides?: Partial<MockLoaders>): MockLoaders {
  return {
    getUserById: jest.fn(),
    getAssignedPlan: jest.fn(),
    getDefaultPlan: jest.fn(),
    getChannelsByIds: jest.fn(),
    ...overrides,
  };
}

describe('admin access resolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns admin bypass when the request role is admin', async () => {
    const loaders = createLoaders();

    const result = await createResolveUserEntitlements(loaders)({
      userId: 'user-1',
      role: SystemRoles.ADMIN,
    });

    expect(result).toEqual({
      userId: 'user-1',
      scope: 'admin_bypass',
      plan: null,
      allowedChannels: [],
      allowedPairs: [],
      isRestricted: false,
    });
    expect(loaders.getUserById).not.toHaveBeenCalled();
  });

  it('returns admin bypass when the stored user role is admin', async () => {
    const loaders = createLoaders({
      getUserById: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        role: SystemRoles.ADMIN,
        adminPlanId: null,
      }),
    });

    const result = await createResolveUserEntitlements(loaders)({
      userId: 'user-1',
    });

    expect(result.scope).toBe('admin_bypass');
    expect(result.isRestricted).toBe(false);
  });

  it('throws when the user does not exist', async () => {
    const loaders = createLoaders({
      getUserById: jest.fn().mockResolvedValue(null),
    });

    await expect(
      createResolveUserEntitlements(loaders)({
        userId: 'missing-user',
      }),
    ).rejects.toMatchObject({
      message: 'User not found',
      statusCode: 404,
    });
  });

  it('resolves an assigned plan with enabled channels and deduplicated pairs', async () => {
    const planId = new mongoose.Types.ObjectId();
    const channelAId = new mongoose.Types.ObjectId();
    const channelBId = new mongoose.Types.ObjectId();
    const loaders = createLoaders({
      getUserById: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        role: SystemRoles.USER,
        adminPlanId: planId,
      }),
      getAssignedPlan: jest.fn().mockResolvedValue({
        _id: planId,
        name: 'Pro',
        slug: 'pro',
        enabled: true,
        channelIds: [channelAId.toString(), channelBId.toString()],
      }),
      getChannelsByIds: jest.fn().mockResolvedValue([
        {
          _id: channelAId,
          name: 'Starter',
          slug: 'starter',
          enabled: true,
          entries: [
            { endpoint: 'azureOpenAI', model: 'gpt-4o-mini', enabled: true },
            { endpoint: 'azureOpenAI', model: 'gpt-4o', enabled: false },
          ],
        },
        {
          _id: channelBId,
          name: 'Premium',
          slug: 'premium',
          enabled: true,
          entries: [
            { endpoint: 'azureOpenAI', model: 'gpt-4o-mini', enabled: true },
            { endpoint: 'azureOpenAI', model: 'gpt-5.1-chat', enabled: true },
          ],
        },
      ]),
      getDefaultPlan: jest.fn(),
    });

    const result = await createResolveUserEntitlements(loaders)({
      userId: 'user-1',
    });

    expect(result).toEqual({
      userId: 'user-1',
      scope: 'assigned_plan',
      plan: {
        id: planId.toString(),
        name: 'Pro',
        slug: 'pro',
      },
      allowedChannels: [
        {
          id: channelAId.toString(),
          name: 'Starter',
          slug: 'starter',
        },
        {
          id: channelBId.toString(),
          name: 'Premium',
          slug: 'premium',
        },
      ],
      allowedPairs: [
        {
          endpoint: 'azureOpenAI',
          model: 'gpt-4o-mini',
          channelId: channelAId.toString(),
          channelSlug: 'starter',
        },
        {
          endpoint: 'azureOpenAI',
          model: 'gpt-5.1-chat',
          channelId: channelBId.toString(),
          channelSlug: 'premium',
        },
      ],
      isRestricted: true,
    });
    expect(loaders.getDefaultPlan).not.toHaveBeenCalled();
  });

  it('returns invalid_plan when an assigned plan is missing', async () => {
    const planId = new mongoose.Types.ObjectId();
    const loaders = createLoaders({
      getUserById: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        role: SystemRoles.USER,
        adminPlanId: planId,
      }),
      getAssignedPlan: jest.fn().mockResolvedValue(null),
    });

    const result = await createResolveUserEntitlements(loaders)({
      userId: 'user-1',
    });

    expect(result).toEqual({
      userId: 'user-1',
      scope: 'invalid_plan',
      plan: null,
      allowedChannels: [],
      allowedPairs: [],
      isRestricted: true,
    });
  });

  it('returns invalid_plan when an assigned plan is disabled', async () => {
    const planId = new mongoose.Types.ObjectId();
    const loaders = createLoaders({
      getUserById: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        role: SystemRoles.USER,
        adminPlanId: planId,
      }),
      getAssignedPlan: jest.fn().mockResolvedValue({
        _id: planId,
        name: 'Legacy',
        slug: 'legacy',
        enabled: false,
        channelIds: [],
      }),
    });

    const result = await createResolveUserEntitlements(loaders)({
      userId: 'user-1',
    });

    expect(result).toEqual({
      userId: 'user-1',
      scope: 'invalid_plan',
      plan: {
        id: planId.toString(),
        name: 'Legacy',
        slug: 'legacy',
      },
      allowedChannels: [],
      allowedPairs: [],
      isRestricted: true,
    });
  });

  it('falls back to the enabled default plan when no plan is assigned', async () => {
    const planId = new mongoose.Types.ObjectId();
    const channelId = new mongoose.Types.ObjectId();
    const loaders = createLoaders({
      getUserById: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        role: SystemRoles.USER,
        adminPlanId: null,
      }),
      getDefaultPlan: jest.fn().mockResolvedValue({
        _id: planId,
        name: 'Default',
        slug: 'default',
        enabled: true,
        channelIds: [channelId.toString()],
      }),
      getChannelsByIds: jest.fn().mockResolvedValue([
        {
          _id: channelId,
          name: 'Starter',
          slug: 'starter',
          enabled: true,
          entries: [{ endpoint: 'azureOpenAI', model: 'gpt-4o-mini', enabled: true }],
        },
      ]),
    });

    const result = await createResolveUserEntitlements(loaders)({
      userId: 'user-1',
    });

    expect(result.scope).toBe('default_plan');
    expect(result.plan).toEqual({
      id: planId.toString(),
      name: 'Default',
      slug: 'default',
    });
    expect(result.allowedPairs).toEqual([
      {
        endpoint: 'azureOpenAI',
        model: 'gpt-4o-mini',
        channelId: channelId.toString(),
        channelSlug: 'starter',
      },
    ]);
  });

  it('returns unrestricted when no assigned or default plan exists', async () => {
    const loaders = createLoaders({
      getUserById: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        role: SystemRoles.USER,
        adminPlanId: null,
      }),
      getDefaultPlan: jest.fn().mockResolvedValue(null),
    });

    const result = await createResolveUserEntitlements(loaders)({
      userId: 'user-1',
    });

    expect(result).toEqual({
      userId: 'user-1',
      scope: 'unrestricted',
      plan: null,
      allowedChannels: [],
      allowedPairs: [],
      isRestricted: false,
    });
  });

  it('treats missing and disabled channels as unavailable while keeping plan scope', async () => {
    const planId = new mongoose.Types.ObjectId();
    const channelId = new mongoose.Types.ObjectId();
    const loaders = createLoaders({
      getUserById: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        role: SystemRoles.USER,
        adminPlanId: planId,
      }),
      getAssignedPlan: jest.fn().mockResolvedValue({
        _id: planId,
        name: 'Locked Down',
        slug: 'locked-down',
        enabled: true,
        channelIds: [channelId.toString(), 'missing-channel'],
      }),
      getChannelsByIds: jest.fn().mockResolvedValue([
        {
          _id: channelId,
          name: 'Disabled',
          slug: 'disabled',
          enabled: false,
          entries: [{ endpoint: 'azureOpenAI', model: 'gpt-4o-mini', enabled: true }],
        },
      ]),
    });

    const result = await createResolveUserEntitlements(loaders)({
      userId: 'user-1',
    });

    expect(result.scope).toBe('assigned_plan');
    expect(result.allowedChannels).toEqual([]);
    expect(result.allowedPairs).toEqual([]);
    expect(result.isRestricted).toBe(true);
  });
});

describe('isPairAllowed', () => {
  it('returns true for unrestricted users', () => {
    expect(
      isPairAllowed(
        {
          userId: 'user-1',
          scope: 'unrestricted',
          plan: null,
          allowedChannels: [],
          allowedPairs: [],
          isRestricted: false,
        },
        'azureOpenAI',
        'gpt-4o',
      ),
    ).toBe(true);
  });

  it('checks allowed pairs for restricted users', () => {
    expect(
      isPairAllowed(
        {
          userId: 'user-1',
          scope: 'assigned_plan',
          plan: {
            id: 'plan-1',
            name: 'Pro',
            slug: 'pro',
          },
          allowedChannels: [],
          allowedPairs: [
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o-mini',
              channelId: 'channel-1',
              channelSlug: 'starter',
            },
          ],
          isRestricted: true,
        },
        'azureOpenAI',
        'gpt-4o-mini',
      ),
    ).toBe(true);

    expect(
      isPairAllowed(
        {
          userId: 'user-1',
          scope: 'assigned_plan',
          plan: {
            id: 'plan-1',
            name: 'Pro',
            slug: 'pro',
          },
          allowedChannels: [],
          allowedPairs: [
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o-mini',
              channelId: 'channel-1',
              channelSlug: 'starter',
            },
          ],
          isRestricted: true,
        },
        'azureOpenAI',
        'gpt-4o',
      ),
    ).toBe(false);
  });
});

describe('getUserEntitlements handler', () => {
  it('returns 401 when req.user is missing', async () => {
    const handler = createGetUserEntitlements(jest.fn());
    const json = jest.fn();
    const res = {
      status: jest.fn().mockReturnThis(),
      json,
    } as unknown as Parameters<typeof handler>[1];

    await handler({} as Parameters<typeof handler>[0], res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ message: 'Authentication required' });
  });

  it('returns sanitized entitlements from the injected resolver', async () => {
    const resolve = jest.fn().mockResolvedValue({
      userId: 'user-1',
      scope: 'assigned_plan',
      plan: {
        id: 'plan-1',
        name: 'Pro',
        slug: 'pro',
      },
      allowedChannels: [
        {
          id: 'channel-1',
          name: 'Starter',
          slug: 'starter',
        },
      ],
      allowedPairs: [
        {
          endpoint: 'azureOpenAI',
          model: 'gpt-4o-mini',
          channelId: 'channel-1',
          channelSlug: 'starter',
        },
      ],
      isRestricted: true,
    });
    const handler = createGetUserEntitlements(resolve);
    const json = jest.fn();
    const res = {
      status: jest.fn().mockReturnThis(),
      json,
    } as unknown as Parameters<typeof handler>[1];

    await handler(
      {
        user: {
          id: 'user-1',
          role: SystemRoles.USER,
        },
      } as Parameters<typeof handler>[0],
      res,
    );

    expect(resolve).toHaveBeenCalledWith({
      userId: 'user-1',
      role: SystemRoles.USER,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      scope: 'assigned_plan',
      plan: {
        id: 'plan-1',
        name: 'Pro',
        slug: 'pro',
      },
      allowedChannels: [
        {
          id: 'channel-1',
          name: 'Starter',
          slug: 'starter',
        },
      ],
      allowedPairs: [
        {
          endpoint: 'azureOpenAI',
          model: 'gpt-4o-mini',
          channelId: 'channel-1',
          channelSlug: 'starter',
        },
      ],
      isRestricted: true,
    });
  });

  it('forwards resolver status errors', async () => {
    const resolve = jest.fn().mockRejectedValue(
      Object.assign(new Error('User not found'), { statusCode: 404 }),
    );
    const handler = createGetUserEntitlements(resolve);
    const json = jest.fn();
    const res = {
      status: jest.fn().mockReturnThis(),
      json,
    } as unknown as Parameters<typeof handler>[1];

    await handler(
      {
        user: {
          id: 'user-1',
        },
      } as Parameters<typeof handler>[0],
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ message: 'User not found' });
  });
});

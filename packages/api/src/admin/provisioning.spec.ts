import mongoose from 'mongoose';
import {
  createApplyStartingCredits,
  createResolveProvisioningState,
} from './provisioning';

type MockLoaders = Parameters<typeof createResolveProvisioningState>[0];

function createLoaders(overrides?: Partial<MockLoaders>): MockLoaders {
  return {
    getUserById: jest.fn(),
    getPlanById: jest.fn(),
    getBalanceByUserId: jest.fn(),
    updateBalance: jest.fn(),
    updateUserProvisioningMetadata: jest.fn().mockResolvedValue(undefined),
    createTransaction: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('admin provisioning helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves a non-applicable state when no plan is assigned', async () => {
    const userId = new mongoose.Types.ObjectId();
    const loaders = createLoaders({
      getUserById: jest.fn().mockResolvedValue({
        _id: userId,
        adminPlanId: null,
        adminPlanStartingCreditsAppliedAt: null,
        adminPlanStartingCreditsAppliedPlanId: null,
        adminPlanStartingCreditsAppliedAmount: null,
        adminPlanStartingCreditsAppliedSource: null,
      }),
      getBalanceByUserId: jest.fn().mockResolvedValue(null),
    });

    const result = await createResolveProvisioningState(loaders)({
      appConfig: { balance: { enabled: true } },
      userId,
    });

    expect(result).toEqual({
      balanceEnabled: true,
      hasBalanceRecord: false,
      currentPlanStartingCredits: null,
      appliedAt: null,
      appliedPlanId: null,
      appliedAmount: null,
      appliedSource: null,
      appliedPlanMatchesCurrent: false,
      canApplyStartingCredits: false,
    });
  });

  it('auto-seeds starting credits only when there is no balance record', async () => {
    const userId = new mongoose.Types.ObjectId();
    const planId = new mongoose.Types.ObjectId();
    const loaders = createLoaders({
      getUserById: jest
        .fn()
        .mockResolvedValueOnce({
          _id: userId,
          adminPlanId: planId,
          adminPlanStartingCreditsAppliedAt: null,
          adminPlanStartingCreditsAppliedPlanId: null,
          adminPlanStartingCreditsAppliedAmount: null,
          adminPlanStartingCreditsAppliedSource: null,
        })
        .mockResolvedValueOnce({
          _id: userId,
          adminPlanId: planId,
          adminPlanStartingCreditsAppliedAt: new Date('2026-03-26T04:00:00.000Z'),
          adminPlanStartingCreditsAppliedPlanId: planId,
          adminPlanStartingCreditsAppliedAmount: 5000,
          adminPlanStartingCreditsAppliedSource: 'plan_assignment_auto_seed',
        }),
      getPlanById: jest.fn().mockResolvedValue({
        _id: planId,
        startingCredits: 5000,
      }),
      getBalanceByUserId: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ tokenCredits: 5000 }),
      updateBalance: jest.fn().mockResolvedValue({ tokenCredits: 5000 }),
    });

    const result = await createApplyStartingCredits(loaders)({
      appConfig: { balance: { enabled: true } },
      userId,
      source: 'plan_assignment_auto_seed',
      onlyIfNoBalanceRecord: true,
    });

    expect(loaders.updateBalance).toHaveBeenCalledWith({
      user: userId.toString(),
      incrementValue: 5000,
    });
    expect(loaders.updateUserProvisioningMetadata).toHaveBeenCalledWith({
      userId,
      planId,
      amount: 5000,
      source: 'plan_assignment_auto_seed',
      appliedAt: expect.any(Date),
    });
    expect(loaders.createTransaction).toHaveBeenCalledWith({
      userId,
      amount: 5000,
      source: 'plan_assignment_auto_seed',
    });
    expect(result).toMatchObject({
      applied: true,
      reason: 'applied',
      tokenCredits: 5000,
      provisioning: {
        appliedSource: 'plan_assignment_auto_seed',
        appliedAmount: 5000,
        appliedPlanMatchesCurrent: true,
        canApplyStartingCredits: false,
      },
    });
  });

  it('does not auto-seed when a balance record already exists', async () => {
    const userId = new mongoose.Types.ObjectId();
    const planId = new mongoose.Types.ObjectId();
    const loaders = createLoaders({
      getUserById: jest.fn().mockResolvedValue({
        _id: userId,
        adminPlanId: planId,
        adminPlanStartingCreditsAppliedAt: null,
        adminPlanStartingCreditsAppliedPlanId: null,
        adminPlanStartingCreditsAppliedAmount: null,
        adminPlanStartingCreditsAppliedSource: null,
      }),
      getPlanById: jest.fn().mockResolvedValue({
        _id: planId,
        startingCredits: 5000,
      }),
      getBalanceByUserId: jest.fn().mockResolvedValue({ tokenCredits: 2000 }),
      updateBalance: jest.fn(),
    });

    const result = await createApplyStartingCredits(loaders)({
      appConfig: { balance: { enabled: true } },
      userId,
      source: 'plan_assignment_auto_seed',
      onlyIfNoBalanceRecord: true,
    });

    expect(result).toMatchObject({
      applied: false,
      reason: 'existing_balance_record',
      tokenCredits: 2000,
    });
    expect(loaders.updateBalance).not.toHaveBeenCalled();
    expect(loaders.updateUserProvisioningMetadata).not.toHaveBeenCalled();
  });

  it('allows one explicit manual apply and then blocks repeated applies for the same plan', async () => {
    const userId = new mongoose.Types.ObjectId();
    const planId = new mongoose.Types.ObjectId();
    const loaders = createLoaders({
      getUserById: jest
        .fn()
        .mockResolvedValueOnce({
          _id: userId,
          adminPlanId: planId,
          adminPlanStartingCreditsAppliedAt: null,
          adminPlanStartingCreditsAppliedPlanId: null,
          adminPlanStartingCreditsAppliedAmount: null,
          adminPlanStartingCreditsAppliedSource: null,
        })
        .mockResolvedValueOnce({
          _id: userId,
          adminPlanId: planId,
          adminPlanStartingCreditsAppliedAt: new Date('2026-03-26T04:00:00.000Z'),
          adminPlanStartingCreditsAppliedPlanId: planId,
          adminPlanStartingCreditsAppliedAmount: 3000,
          adminPlanStartingCreditsAppliedSource: 'admin_manual_apply',
        })
        .mockResolvedValueOnce({
          _id: userId,
          adminPlanId: planId,
          adminPlanStartingCreditsAppliedAt: new Date('2026-03-26T04:00:00.000Z'),
          adminPlanStartingCreditsAppliedPlanId: planId,
          adminPlanStartingCreditsAppliedAmount: 3000,
          adminPlanStartingCreditsAppliedSource: 'admin_manual_apply',
        }),
      getPlanById: jest.fn().mockResolvedValue({
        _id: planId,
        startingCredits: 3000,
      }),
      getBalanceByUserId: jest
        .fn()
        .mockResolvedValueOnce({ tokenCredits: 7000 })
        .mockResolvedValueOnce({ tokenCredits: 10000 })
        .mockResolvedValueOnce({ tokenCredits: 10000 }),
      updateBalance: jest.fn().mockResolvedValue({ tokenCredits: 10000 }),
    });
    const applyStartingCredits = createApplyStartingCredits(loaders);

    const firstResult = await applyStartingCredits({
      appConfig: { balance: { enabled: true } },
      userId,
      source: 'admin_manual_apply',
      onlyIfNoBalanceRecord: false,
    });
    const secondResult = await applyStartingCredits({
      appConfig: { balance: { enabled: true } },
      userId,
      source: 'admin_manual_apply',
      onlyIfNoBalanceRecord: false,
    });

    expect(firstResult).toMatchObject({
      applied: true,
      reason: 'applied',
      tokenCredits: 10000,
    });
    expect(secondResult).toMatchObject({
      applied: false,
      reason: 'already_applied_for_current_plan',
      tokenCredits: 10000,
    });
    expect(loaders.updateBalance).toHaveBeenCalledTimes(1);
  });
});

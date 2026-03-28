import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useAddAdminUserBalanceMutation = (): UseMutationResult<
  t.AdminBalanceUpdateResponse,
  t.TError | undefined,
  t.AdminBalanceUpdateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.addAdminUserBalance(variables), {
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries([QueryKeys.adminUser, variables.userId]);
      queryClient.invalidateQueries([QueryKeys.adminUsers]);
    },
  });
};

export const useCreateAdminUserMutation = (): UseMutationResult<
  t.AdminUserCreateResponse,
  t.TError | undefined,
  t.AdminUserCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createAdminUser(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminUsers]);
    },
  });
};

export const useSetAdminUserBalanceMutation = (): UseMutationResult<
  t.AdminBalanceUpdateResponse,
  t.TError | undefined,
  t.AdminBalanceUpdateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.setAdminUserBalance(variables), {
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries([QueryKeys.adminUser, variables.userId]);
      queryClient.invalidateQueries([QueryKeys.adminUsers]);
    },
  });
};

export const useAssignAdminUserPlanMutation = (): UseMutationResult<
  t.AdminUserPlanAssignmentResponse,
  t.TError | undefined,
  t.AdminUserPlanAssignmentRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.assignAdminUserPlan(variables), {
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries([QueryKeys.adminUser, variables.userId]);
      queryClient.invalidateQueries([QueryKeys.adminUsers]);
    },
  });
};

export const useClearAdminUserPlanMutation = (): UseMutationResult<
  t.AdminUserPlanAssignmentResponse,
  t.TError | undefined,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((userId) => dataService.clearAdminUserPlan(userId), {
    onSuccess: (_data, userId) => {
      queryClient.invalidateQueries([QueryKeys.adminUser, userId]);
      queryClient.invalidateQueries([QueryKeys.adminUsers]);
    },
  });
};

export const useApplyAdminUserStartingCreditsMutation = (): UseMutationResult<
  t.AdminApplyStartingCreditsResponse,
  t.TError | undefined,
  t.AdminApplyStartingCreditsRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.applyAdminUserStartingCredits(variables), {
    onSuccess: (data, variables) => {
      queryClient.setQueryData<t.AdminUserDetail | undefined>(
        [QueryKeys.adminUser, variables.userId],
        (current) => {
          if (current == null) {
            return current;
          }

          return {
            ...current,
            balance: {
              ...current.balance,
              tokenCredits: data.tokenCredits,
            },
            provisioning: data.provisioning,
          };
        },
      );
      queryClient.invalidateQueries([QueryKeys.adminUser, variables.userId]);
      queryClient.invalidateQueries([QueryKeys.adminUsers]);
    },
  });
};

export const useCreateAdminPlanMutation = (): UseMutationResult<
  t.AdminPlan,
  t.TError | undefined,
  t.AdminPlanUpsertRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createAdminPlan(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminPlans]);
    },
  });
};

export const useCreateAdminChannelMutation = (): UseMutationResult<
  t.AdminChannel,
  t.TError | undefined,
  t.AdminChannelUpsertRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createAdminChannel(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminChannels]);
      queryClient.invalidateQueries([QueryKeys.adminChannelInventory]);
      queryClient.invalidateQueries([QueryKeys.endpoints]);
      queryClient.invalidateQueries([QueryKeys.models]);
    },
  });
};

export const useUpdateAdminChannelMutation = (): UseMutationResult<
  t.AdminChannel,
  t.TError | undefined,
  t.AdminChannelUpdateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.updateAdminChannel(variables), {
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries([QueryKeys.adminChannels]);
      queryClient.invalidateQueries([QueryKeys.adminChannel, variables.channelId]);
      queryClient.invalidateQueries([QueryKeys.adminChannelInventory]);
      queryClient.invalidateQueries([QueryKeys.endpoints]);
      queryClient.invalidateQueries([QueryKeys.models]);
    },
  });
};

export const useDeleteAdminChannelMutation = (): UseMutationResult<
  t.AdminChannelDeleteResponse,
  t.TError | undefined,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((channelId) => dataService.deleteAdminChannel(channelId), {
    onSuccess: (_data, channelId) => {
      queryClient.invalidateQueries([QueryKeys.adminChannels]);
      queryClient.removeQueries([QueryKeys.adminChannel, channelId]);
      queryClient.invalidateQueries([QueryKeys.adminChannelInventory]);
      queryClient.invalidateQueries([QueryKeys.endpoints]);
      queryClient.invalidateQueries([QueryKeys.models]);
    },
  });
};

export const useUpdateAdminPlanMutation = (): UseMutationResult<
  t.AdminPlan,
  t.TError | undefined,
  t.AdminPlanUpdateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.updateAdminPlan(variables), {
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries([QueryKeys.adminPlans]);
      queryClient.invalidateQueries([QueryKeys.adminPlan, variables.planId]);
    },
  });
};

export const useDeleteAdminPlanMutation = (): UseMutationResult<
  t.AdminPlanDeleteResponse,
  t.TError | undefined,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((planId) => dataService.deleteAdminPlan(planId), {
    onSuccess: (_data, planId) => {
      queryClient.invalidateQueries([QueryKeys.adminPlans]);
      queryClient.removeQueries([QueryKeys.adminPlan, planId]);
    },
  });
};

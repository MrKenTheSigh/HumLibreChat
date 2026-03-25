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

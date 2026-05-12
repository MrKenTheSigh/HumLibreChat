import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useCreateUserQuotaRequestMutation = (): UseMutationResult<
  t.UserQuotaRequestCreateResponse,
  t.TError | undefined,
  t.UserQuotaRequestCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createUserQuotaRequest(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.quotaRequests]);
      queryClient.invalidateQueries([QueryKeys.balance]);
    },
  });
};

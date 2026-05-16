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
      queryClient.invalidateQueries([QueryKeys.adminQuotaAccounts]);
      queryClient.invalidateQueries([QueryKeys.adminQuotaLedger]);
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

export const useCreateAdminManagerReviewBatchMutation = (): UseMutationResult<
  t.AdminManagerReviewBatchCreateResponse,
  t.TError | undefined,
  t.AdminManagerReviewBatchCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createAdminManagerReviewBatch(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminManagerReviewBatches]);
    },
  });
};

export const usePreviewAdminManagerReviewBatchEmailMutation = (): UseMutationResult<
  t.AdminManagerReviewEmailPreviewResponse,
  t.TError | undefined,
  string,
  unknown
> => {
  return useMutation((batchId) => dataService.previewAdminManagerReviewBatchEmail(batchId));
};

export const useSendAdminManagerReviewBatchEmailMutation = (): UseMutationResult<
  t.AdminManagerReviewEmailSendResponse,
  t.TError | undefined,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((batchId) => dataService.sendAdminManagerReviewBatchEmail(batchId), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminManagerReviewBatches]);
    },
  });
};

export const useSendAdminManagerReviewBatchReminderEmailMutation = (): UseMutationResult<
  t.AdminManagerReviewEmailSendResponse,
  t.TError | undefined,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((batchId) => dataService.sendAdminManagerReviewBatchReminderEmail(batchId), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminManagerReviewBatches]);
    },
  });
};

export const useScanAdminManagerReviewBatchesOverdueMutation = (): UseMutationResult<
  t.AdminManagerReviewOverdueScanResponse,
  t.TError | undefined,
  void,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(() => dataService.scanAdminManagerReviewBatchesOverdue(), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminManagerReviewBatches]);
    },
  });
};

export const useSubmitAdminManagerReviewBatchResponseMutation = (): UseMutationResult<
  t.AdminManagerReviewBatchResponseResponse,
  t.TError | undefined,
  t.AdminManagerReviewBatchResponseRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.submitAdminManagerReviewBatchResponse(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminManagerReviewBatches]);
    },
  });
};

export const useUpdateAdminUserMutation = (): UseMutationResult<
  t.AdminUserUpdateResponse,
  t.TError | undefined,
  t.AdminUserUpdateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.updateAdminUser(variables), {
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries([QueryKeys.adminUser, variables.userId]);
      queryClient.invalidateQueries([QueryKeys.adminUsers]);
      queryClient.invalidateQueries([QueryKeys.user]);
    },
  });
};

export const useCreateAdminRoleMutation = (): UseMutationResult<
  t.AdminRole,
  t.TError | undefined,
  t.AdminRoleCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createAdminRole(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminRoles]);
    },
  });
};

export const useUpdateAdminRoleMutation = (): UseMutationResult<
  t.AdminRole,
  t.TError | undefined,
  t.AdminRoleUpdateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.updateAdminRole(variables), {
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries([QueryKeys.adminRoles]);
      queryClient.invalidateQueries([QueryKeys.adminRole, variables.roleName]);
      queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
    },
  });
};

export const useDeleteAdminRoleMutation = (): UseMutationResult<
  t.AdminRoleDeleteResponse,
  t.TError | undefined,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((roleName) => dataService.deleteAdminRole(roleName), {
    onSuccess: (_data, roleName) => {
      queryClient.invalidateQueries([QueryKeys.adminRoles]);
      queryClient.removeQueries([QueryKeys.adminRole, roleName]);
      queryClient.removeQueries([QueryKeys.roles, roleName]);
    },
  });
};

export const useUpdateAdminMemorySystemSettingMutation = (): UseMutationResult<
  t.AdminMemorySystemSettingUpdateResponse,
  t.TError | undefined,
  t.AdminMemorySystemSettingUpdateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.updateAdminMemorySystemSetting(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminSystemSettings]);
      queryClient.invalidateQueries([QueryKeys.startupConfig]);
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

export const useUpdateAdminUserRoleMutation = (): UseMutationResult<
  t.AdminUserRoleAssignmentResponse,
  t.TError | undefined,
  t.AdminUserRoleAssignmentRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.updateAdminUserRole(variables), {
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries([QueryKeys.adminUser, variables.userId]);
      queryClient.invalidateQueries([QueryKeys.adminUsers]);
    },
  });
};

export const useUpdateAdminUserDepartmentMutation = (): UseMutationResult<
  t.AdminUserDepartmentAssignmentResponse,
  t.TError | undefined,
  t.AdminUserDepartmentAssignmentRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.updateAdminUserDepartment(variables), {
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

export const useCreateAdminDepartmentMutation = (): UseMutationResult<
  t.AdminDepartment,
  t.TError | undefined,
  t.AdminDepartmentCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createAdminDepartment(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminDepartments]);
    },
  });
};

export const useUpdateAdminDepartmentMutation = (): UseMutationResult<
  t.AdminDepartment,
  t.TError | undefined,
  t.AdminDepartmentUpdateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.updateAdminDepartment(variables), {
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries([QueryKeys.adminDepartments]);
      queryClient.invalidateQueries([QueryKeys.adminDepartment, variables.departmentId]);
      queryClient.invalidateQueries([QueryKeys.adminUsers]);
    },
  });
};

export const useDeleteAdminDepartmentMutation = (): UseMutationResult<
  t.AdminDepartment,
  t.TError | undefined,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((departmentId) => dataService.deleteAdminDepartment(departmentId), {
    onSuccess: (_data, departmentId) => {
      queryClient.invalidateQueries([QueryKeys.adminDepartments]);
      queryClient.invalidateQueries([QueryKeys.adminDepartment, departmentId]);
      queryClient.invalidateQueries([QueryKeys.adminUsers]);
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

export const useCreateAdminQuotaPeriodMutation = (): UseMutationResult<
  t.AdminQuotaPeriodCreateResponse,
  t.TError | undefined,
  t.AdminQuotaPeriodCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createAdminQuotaPeriod(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminQuotaPeriods]);
      queryClient.invalidateQueries([QueryKeys.adminQuotaAccounts]);
      queryClient.invalidateQueries([QueryKeys.adminQuotaLedger]);
    },
  });
};

export const useActivateAdminQuotaPeriodMutation = (): UseMutationResult<
  t.AdminQuotaPeriod,
  t.TError | undefined,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((periodId) => dataService.activateAdminQuotaPeriod(periodId), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminQuotaPeriods]);
    },
  });
};

export const useCloseAdminQuotaPeriodMutation = (): UseMutationResult<
  t.AdminQuotaPeriod,
  t.TError | undefined,
  string,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((periodId) => dataService.closeAdminQuotaPeriod(periodId), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminQuotaPeriods]);
    },
  });
};

export const useCreateAdminQuotaAllocationMutation = (): UseMutationResult<
  t.AdminQuotaAllocationCreateResponse,
  t.TError | undefined,
  t.AdminQuotaAllocationCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createAdminQuotaAllocation(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminQuotaAccounts]);
      queryClient.invalidateQueries([QueryKeys.adminQuotaLedger]);
    },
  });
};

export const useCreateAdminQuotaGrantMutation = (): UseMutationResult<
  t.AdminQuotaGrantCreateResponse,
  t.TError | undefined,
  t.AdminQuotaGrantCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createAdminQuotaGrant(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminQuotaAccounts]);
      queryClient.invalidateQueries([QueryKeys.adminQuotaLedger]);
      queryClient.invalidateQueries([QueryKeys.adminQuotaGrants]);
    },
  });
};

export const useCreateAdminQuotaGrantRequestMutation = (): UseMutationResult<
  t.AdminQuotaGrantRequestCreateResponse,
  t.TError | undefined,
  t.AdminQuotaGrantCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createAdminQuotaGrantRequest(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminQuotaGrants]);
    },
  });
};

export const useApproveAdminQuotaGrantRequestMutation = (): UseMutationResult<
  t.AdminQuotaGrantDecisionResponse,
  t.TError | undefined,
  t.AdminQuotaGrantDecisionRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.approveAdminQuotaGrantRequest(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminQuotaAccounts]);
      queryClient.invalidateQueries([QueryKeys.adminQuotaLedger]);
      queryClient.invalidateQueries([QueryKeys.adminQuotaGrants]);
    },
  });
};

export const useRejectAdminQuotaGrantRequestMutation = (): UseMutationResult<
  t.AdminQuotaGrantDecisionResponse,
  t.TError | undefined,
  t.AdminQuotaGrantDecisionRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.rejectAdminQuotaGrantRequest(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminQuotaGrants]);
    },
  });
};

export const useCreateAdminQuotaRequestMutation = (): UseMutationResult<
  t.AdminQuotaRequestCreateResponse,
  t.TError | undefined,
  t.AdminQuotaRequestCreateRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.createAdminQuotaRequest(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminQuotaRequests]);
    },
  });
};

export const useApproveAdminQuotaRequestMutation = (): UseMutationResult<
  t.AdminQuotaRequestDecisionResponse,
  t.TError | undefined,
  t.AdminQuotaRequestDecisionRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.approveAdminQuotaRequest(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminQuotaAccounts]);
      queryClient.invalidateQueries([QueryKeys.adminQuotaLedger]);
      queryClient.invalidateQueries([QueryKeys.adminQuotaRequests]);
    },
  });
};

export const useRejectAdminQuotaRequestMutation = (): UseMutationResult<
  t.AdminQuotaRequestDecisionResponse,
  t.TError | undefined,
  t.AdminQuotaRequestDecisionRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation((variables) => dataService.rejectAdminQuotaRequest(variables), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminQuotaRequests]);
    },
  });
};

import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';
import store from '~/store';

export const useGetAdminUsersQuery = (
  params: t.AdminUsersListParams,
  config?: UseQueryOptions<t.AdminUsersListResponse>,
): QueryObserverResult<t.AdminUsersListResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);

  return useQuery<t.AdminUsersListResponse>(
    [QueryKeys.adminUsers, params],
    () => dataService.getAdminUsers(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};

export const useGetAdminUserQuery = (
  userId: string,
  config?: UseQueryOptions<t.AdminUserDetail>,
): QueryObserverResult<t.AdminUserDetail> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);

  return useQuery<t.AdminUserDetail>(
    [QueryKeys.adminUser, userId],
    () => dataService.getAdminUser(userId),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      retry: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled && userId.length > 0,
    },
  );
};

export const useGetAdminConversationsQuery = (
  params: t.AdminConversationListParams,
  config?: UseQueryOptions<t.AdminConversationListResponse>,
): QueryObserverResult<t.AdminConversationListResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);

  return useQuery<t.AdminConversationListResponse>(
    [QueryKeys.adminConversations, params],
    () => dataService.getAdminConversations(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};

export const useGetAdminConversationQuery = (
  conversationId: string,
  config?: UseQueryOptions<t.AdminConversationItem>,
): QueryObserverResult<t.AdminConversationItem> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);

  return useQuery<t.AdminConversationItem>(
    [QueryKeys.adminConversation, conversationId],
    () => dataService.getAdminConversation(conversationId),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      retry: false,
      ...config,
      enabled:
        (config?.enabled ?? true) === true && queriesEnabled && conversationId.length > 0,
    },
  );
};

export const useGetAdminConversationMessagesQuery = (
  conversationId: string,
  config?: UseQueryOptions<t.AdminConversationMessagesResponse>,
): QueryObserverResult<t.AdminConversationMessagesResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);

  return useQuery<t.AdminConversationMessagesResponse>(
    [QueryKeys.adminConversationMessages, conversationId],
    () => dataService.getAdminConversationMessages(conversationId),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      retry: false,
      ...config,
      enabled:
        (config?.enabled ?? true) === true && queriesEnabled && conversationId.length > 0,
    },
  );
};

import type { InfiniteData } from '@tanstack/react-query';
import type * as p from '../accessPermissions';
import type * as a from '../types/agents';
import type * as s from '../schemas';
import type * as t from '../types';
import type * as r from '../roles';

export type Conversation = {
  id: string;
  createdAt: number;
  participants: string[];
  lastMessage: string;
  conversations: s.TConversation[];
};

export type ConversationListParams = {
  cursor?: string;
  isArchived?: boolean;
  sortBy?: 'title' | 'createdAt' | 'updatedAt';
  sortDirection?: 'asc' | 'desc';
  tags?: string[];
  search?: string;
};

export type MinimalConversation = Pick<
  s.TConversation,
  'conversationId' | 'endpoint' | 'title' | 'createdAt' | 'updatedAt' | 'user'
>;

export type ConversationListResponse = {
  conversations: MinimalConversation[];
  nextCursor: string | null;
};

export type ConversationData = InfiniteData<ConversationListResponse>;
export type ConversationUpdater = (
  data: ConversationData,
  conversation: s.TConversation,
) => ConversationData;

export type AdminUsersListParams = {
  cursor?: string;
  limit?: number;
  search?: string;
  role?: string;
  provider?: string;
  emailVerified?: boolean;
};

export type AdminRole = r.TRole;

export type AdminRolesListResponse = {
  roles: AdminRole[];
};

export type AdminRoleCreateRequest = {
  name: string;
  description?: string | null;
  permissions: r.TRole['permissions'];
};

export type AdminRoleUpdateRequest = {
  roleName: string;
  description?: string | null;
  permissions?: r.TRole['permissions'];
};

export type AdminRoleDeleteResponse = {
  deleted: boolean;
  roleName: string;
};

export type AdminUserSummary = {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  role: string | null;
  provider: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminUsersListResponse = {
  users: AdminUserSummary[];
  nextCursor: string | null;
};

export type AdminUserCreateRequest = {
  name: string;
  username?: string | null;
  email: string;
  password: string;
  emailVerified?: boolean;
  role?: string;
};

export type AdminUserCreateResponse = AdminUserSummary;

export type AdminUserDetail = AdminUserSummary & {
  termsAccepted: boolean;
  favoritesCount: number;
  plugins: string[];
  roleManagement: {
    isPrimaryAdminProtected: boolean;
    canChangeRole: boolean;
    canDelete: boolean;
  };
  personalization: {
    memories: boolean;
  };
  plan: {
    id: string;
    name: string;
    slug: string;
    startingCredits: number | null;
  } | null;
  planAssignedAt: string | null;
  balance: {
    tokenCredits: number;
    updatedAt: string | null;
  };
  provisioning: AdminUserProvisioningState;
};

export type AdminBalanceUpdateRequest = {
  userId: string;
  amount: number;
};

export type AdminBalanceUpdateResponse = {
  userId: string;
  tokenCredits: number;
  updatedAt: string | null;
};

export type AdminUserPlanAssignmentRequest = {
  userId: string;
  planId: string;
};

export type AdminUserPlanAssignmentResponse = {
  userId: string;
  plan: {
    id: string;
    name: string;
    slug: string;
  } | null;
  assignedAt: string | null;
};

export type AdminProvisioningSource = 'plan_assignment_auto_seed' | 'admin_manual_apply';

export type AdminUserProvisioningState = {
  balanceEnabled: boolean;
  hasBalanceRecord: boolean;
  currentPlanStartingCredits: number | null;
  appliedAt: string | null;
  appliedPlanId: string | null;
  appliedAmount: number | null;
  appliedSource: AdminProvisioningSource | null;
  appliedPlanMatchesCurrent: boolean;
  canApplyStartingCredits: boolean;
};

export type AdminApplyStartingCreditsRequest = {
  userId: string;
};

export type AdminApplyStartingCreditsResponse = {
  applied: boolean;
  reason:
    | 'applied'
    | 'already_applied_for_current_plan'
    | 'balance_disabled'
    | 'existing_balance_record'
    | 'no_plan'
    | 'plan_has_no_starting_credits';
  tokenCredits: number;
  provisioning: AdminUserProvisioningState;
};

export type AdminUserRoleAssignmentRequest = {
  userId: string;
  roleName: string;
};

export type AdminUserRoleAssignmentResponse = {
  userId: string;
  role: string;
};

export type AdminTransactionsListParams = {
  cursor?: string;
  limit?: number;
  userId?: string;
  model?: string;
  context?: string;
  tokenType?: 'prompt' | 'completion' | 'credits';
  dateFrom?: string;
  dateTo?: string;
};

export type AdminTransactionItem = {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  conversationId: string | null;
  tokenType: 'prompt' | 'completion' | 'credits';
  model: string | null;
  context: string | null;
  rawAmount: number | null;
  tokenValue: number | null;
  rate: number | null;
  rateDetail: Record<string, number> | null;
  inputTokens: number | null;
  writeTokens: number | null;
  readTokens: number | null;
  createdAt: string | null;
};

export type AdminTransactionsResponse = {
  transactions: AdminTransactionItem[];
  nextCursor: string | null;
};

export type AdminUsageSummaryResponse = {
  transactionCount: number;
  uniqueUsers: number;
  totalTokenValue: number;
  totalRawAmount: number;
  totalInputTokens: number;
  totalWriteTokens: number;
  totalReadTokens: number;
  newestTransactionAt: string | null;
  oldestTransactionAt: string | null;
};

export type AdminChannelInventoryItem = {
  endpoint: string;
  model: string;
  label: string;
  source: 'runtime' | 'builtin';
  defaultRates: AdminChannelPricingOverride | null;
  defaultParameters: null;
};

export type AdminChannelInventoryResponse = {
  inventory: AdminChannelInventoryItem[];
};

export type AdminChannelProviderType =
  | 'azureOpenAI'
  | 'custom'
  | 'ollama'
  | 'openAI'
  | 'google'
  | 'anthropic'
  | 'bedrock';

export type AdminChannelPricingOverride = {
  prompt: number | null;
  completion: number | null;
  write: number | null;
  read: number | null;
};

export type AdminChannelHeader = {
  key: string;
  value: string;
};

export type AdminChannelConnection = {
  runtimeEndpoint: string;
  baseURL: string;
  instanceName: string;
  apiVersion: string;
  region: string;
  modelFetch: boolean;
  headers: AdminChannelHeader[];
};

export type AdminChannelSecrets = {
  apiKey: string;
  apiKeyRef: string;
  accessKeyId: string;
  accessKeyIdRef: string;
  secretAccessKey: string;
  secretAccessKeyRef: string;
  sessionToken: string;
  sessionTokenRef: string;
};

export type AdminChannelModel = {
  model: string;
  enabled: boolean;
  deploymentName: string;
  pricingOverride: AdminChannelPricingOverride | null;
};

export type AdminChannel = {
  id: string;
  name: string;
  slug: string;
  providerType: AdminChannelProviderType;
  description: string;
  enabled: boolean;
  sortOrder: number;
  connection: AdminChannelConnection;
  secrets: AdminChannelSecrets;
  models: AdminChannelModel[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminChannelsListResponse = {
  channels: AdminChannel[];
};

export type AdminChannelUpsertRequest = {
  name: string;
  slug: string;
  providerType: AdminChannelProviderType;
  description: string;
  enabled: boolean;
  sortOrder: number;
  connection: AdminChannelConnection;
  secrets: AdminChannelSecrets;
  models: AdminChannelModel[];
};

export type AdminChannelUpdateRequest = AdminChannelUpsertRequest & {
  channelId: string;
};

export type AdminChannelDeleteResponse = {
  id: string;
  deleted: true;
};

export type AdminPlanModelEntitlement = {
  channelId: string;
  endpoint: string;
  model: string;
};

export type AdminPlan = {
  id: string;
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  channelIds: string[];
  modelEntitlements: AdminPlanModelEntitlement[];
  notes: string;
  startingCredits: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminPlansListResponse = {
  plans: AdminPlan[];
};

export type AdminPlanUpsertRequest = {
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  channelIds: string[];
  modelEntitlements: AdminPlanModelEntitlement[];
  notes: string;
  startingCredits: number | null;
};

export type AdminPlanUpdateRequest = AdminPlanUpsertRequest & {
  planId: string;
};

export type AdminPlanDeleteResponse = {
  id: string;
  deleted: true;
};

export type UserEntitlementScope =
  | 'admin_bypass'
  | 'assigned_plan'
  | 'default_plan'
  | 'unrestricted'
  | 'invalid_plan';

export type UserEntitlementPlan = {
  id: string;
  name: string;
  slug: string;
};

export type UserEntitlementChannel = {
  id: string;
  name: string;
  slug: string;
};

export type UserEntitlementPair = {
  endpoint: string;
  model: string;
  channelId: string;
  channelSlug: string;
};

export type UserEntitlementsResponse = {
  scope: UserEntitlementScope;
  isRestricted: boolean;
  plan: UserEntitlementPlan | null;
  allowedChannels: UserEntitlementChannel[];
  allowedPairs: UserEntitlementPair[];
};

export type AdminConversationListParams = {
  cursor?: string;
  limit?: number;
  search?: string;
  userId?: string;
  endpoint?: string;
  model?: string;
  createdAfter?: string;
  createdBefore?: string;
};

export type AdminConversationItem = {
  conversationId: string;
  userId: string;
  userEmail: string | null;
  title: string | null;
  endpoint: string | null;
  model: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminConversationListResponse = {
  conversations: AdminConversationItem[];
  nextCursor: string | null;
};

export type AdminConversationMessage = {
  messageId: string;
  parentMessageId: string | null;
  isCreatedByUser: boolean;
  sender: string | null;
  text: string | null;
  content: unknown[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminConversationMessagesResponse = {
  conversation: AdminConversationItem;
  messages: AdminConversationMessage[];
};

/* Messages */
export type MessagesListParams = {
  cursor?: string | null;
  sortBy?: 'endpoint' | 'createdAt' | 'updatedAt';
  sortDirection?: 'asc' | 'desc';
  pageSize?: number;
  conversationId?: string;
  messageId?: string;
  search?: string;
};

export type MessagesListResponse = {
  messages: s.TMessage[];
  nextCursor: string | null;
};

/* Shared Links */
export type SharedMessagesResponse = Omit<s.TSharedLink, 'messages'> & {
  messages: s.TMessage[];
};

export interface SharedLinksListParams {
  pageSize: number;
  isPublic: boolean;
  sortBy: 'title' | 'createdAt';
  sortDirection: 'asc' | 'desc';
  search?: string;
  cursor?: string;
}

export type SharedLinkItem = {
  shareId: string;
  title: string;
  isPublic: boolean;
  createdAt: Date;
  conversationId: string;
};

export interface SharedLinksResponse {
  links: SharedLinkItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface SharedLinkQueryData {
  pages: SharedLinksResponse[];
  pageParams: (string | null)[];
}

export type AllPromptGroupsFilterRequest = {
  category: string;
  pageNumber: string;
  pageSize: string | number;
  before?: string | null;
  after?: string | null;
  order?: 'asc' | 'desc';
  name?: string;
  author?: string;
};

export type AllPromptGroupsResponse = t.TPromptGroup[];

export type ConversationTagsResponse = s.TConversationTag[];

/* MCP Types */
export type MCPTool = {
  name: string;
  pluginKey: string;
  description: string;
};

export type MCPServer = {
  name: string;
  icon: string;
  authenticated: boolean;
  authConfig: s.TPluginAuthConfig[];
  tools: MCPTool[];
};

export type MCPServersResponse = {
  servers: Record<string, MCPServer>;
};

export type VerifyToolAuthParams = { toolId: string };
export type VerifyToolAuthResponse = {
  authenticated: boolean;
  message?: string | s.AuthType;
  authTypes?: [string, s.AuthType][];
};

export type GetToolCallParams = { conversationId: string };
export type ToolCallResults = a.ToolCallResult[];

export type GetMessageUsageDetailParams = {
  conversationId: string;
  messageId: string;
};

export type MessageUsageDetailResponse = {
  spentCredits: number;
  transactions: Array<{
    tokenType: 'prompt' | 'completion' | 'credits';
    context: string | null;
    model: string | null;
    rawAmount: number | null;
    tokenValue: number | null;
    rate: number | null;
    inputTokens: number | null;
    writeTokens: number | null;
    readTokens: number | null;
    createdAt: string | null;
  }>;
};

/* Memories */
export type TUserMemory = {
  key: string;
  value: string;
  updated_at: string;
  tokenCount?: number;
};

export type MemoriesResponse = {
  memories: TUserMemory[];
  totalTokens: number;
  tokenLimit: number | null;
  usagePercentage: number | null;
};

export type PrincipalSearchParams = {
  q: string;
  limit?: number;
  types?: Array<p.PrincipalType.USER | p.PrincipalType.GROUP | p.PrincipalType.ROLE>;
};

export type PrincipalSearchResponse = {
  query: string;
  limit: number;
  types?: Array<p.PrincipalType.USER | p.PrincipalType.GROUP | p.PrincipalType.ROLE>;
  results: p.TPrincipalSearchResult[];
  count: number;
  sources: {
    local: number;
    entra: number;
  };
};

export type AccessRole = {
  accessRoleId: p.AccessRoleIds;
  name: string;
  description: string;
  permBits: number;
};

export type AccessRolesResponse = AccessRole[];

export interface MCPServerStatus {
  requiresOAuth: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
}

export interface MCPConnectionStatusResponse {
  success: boolean;
  connectionStatus: Record<string, MCPServerStatus>;
}

export interface MCPServerConnectionStatusResponse {
  success: boolean;
  serverName: string;
  requiresOAuth: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
}

export interface MCPAuthValuesResponse {
  success: boolean;
  serverName: string;
  authValueFlags: Record<string, boolean>;
}

/* SharePoint Graph API Token */
export type GraphTokenParams = {
  scopes: string;
};

export type GraphTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

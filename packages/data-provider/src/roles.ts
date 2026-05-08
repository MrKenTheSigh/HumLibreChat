import { z } from 'zod';
import {
  chatPermissionsSchema,
  parametersPermissionsSchema,
  fileUploadsPermissionsSchema,
  Permissions,
  PermissionTypes,
  permissionsSchema,
  agentPermissionsSchema,
  promptPermissionsSchema,
  memoryPermissionsSchema,
  runCodePermissionsSchema,
  bookmarkPermissionsSchema,
  webSearchPermissionsSchema,
  fileSearchPermissionsSchema,
  multiConvoPermissionsSchema,
  mcpServersPermissionsSchema,
  peoplePickerPermissionsSchema,
  remoteAgentsPermissionsSchema,
  temporaryChatPermissionsSchema,
  fileCitationsPermissionsSchema,
} from './permissions';

/**
 * Enum for System Defined Roles
 */
export enum SystemRoles {
  /**
   * The Admin role
   */
  ADMIN = 'ADMIN',
  /**
   * Department-scoped manager role
   */
  MANAGER = 'MANAGER',
  /**
   * Read-only audit role
   */
  AUDITOR = 'AUDITOR',
  /**
   * The default user role
   */
  USER = 'USER',
}

export const roleSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  isSystem: z.boolean().default(false),
  isEditable: z.boolean().default(true),
  isDeletable: z.boolean().default(true),
  permissions: permissionsSchema,
});

export type TRole = z.infer<typeof roleSchema>;

const defaultRolesSchema = z.object({
  [SystemRoles.ADMIN]: roleSchema.extend({
    name: z.literal(SystemRoles.ADMIN),
    permissions: permissionsSchema.extend({
      [PermissionTypes.CHAT]: chatPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
      }),
      [PermissionTypes.PARAMETERS]: parametersPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
      }),
      [PermissionTypes.FILE_UPLOADS]: fileUploadsPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
      }),
      [PermissionTypes.PROMPTS]: promptPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
        [Permissions.CREATE]: z.boolean().default(true),
        [Permissions.SHARE]: z.boolean().default(true),
        [Permissions.SHARE_PUBLIC]: z.boolean().default(true),
      }),
      [PermissionTypes.BOOKMARKS]: bookmarkPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
      }),
      [PermissionTypes.MEMORIES]: memoryPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
        [Permissions.CREATE]: z.boolean().default(true),
        [Permissions.UPDATE]: z.boolean().default(true),
        [Permissions.READ]: z.boolean().default(true),
        [Permissions.OPT_OUT]: z.boolean().default(true),
      }),
      [PermissionTypes.AGENTS]: agentPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
        [Permissions.CREATE]: z.boolean().default(true),
        [Permissions.SHARE]: z.boolean().default(true),
        [Permissions.SHARE_PUBLIC]: z.boolean().default(true),
      }),
      [PermissionTypes.MULTI_CONVO]: multiConvoPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
      }),
      [PermissionTypes.TEMPORARY_CHAT]: temporaryChatPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
      }),
      [PermissionTypes.RUN_CODE]: runCodePermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
      }),
      [PermissionTypes.WEB_SEARCH]: webSearchPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
      }),
      [PermissionTypes.PEOPLE_PICKER]: peoplePickerPermissionsSchema.extend({
        [Permissions.VIEW_USERS]: z.boolean().default(true),
        [Permissions.VIEW_GROUPS]: z.boolean().default(true),
        [Permissions.VIEW_ROLES]: z.boolean().default(true),
      }),
      [PermissionTypes.MARKETPLACE]: z.object({
        [Permissions.USE]: z.boolean().default(false),
      }),
      [PermissionTypes.FILE_SEARCH]: fileSearchPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
      }),
      [PermissionTypes.FILE_CITATIONS]: fileCitationsPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
      }),
      [PermissionTypes.MCP_SERVERS]: mcpServersPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
        [Permissions.CREATE]: z.boolean().default(true),
        [Permissions.SHARE]: z.boolean().default(true),
        [Permissions.SHARE_PUBLIC]: z.boolean().default(true),
      }),
      [PermissionTypes.REMOTE_AGENTS]: remoteAgentsPermissionsSchema.extend({
        [Permissions.USE]: z.boolean().default(true),
        [Permissions.CREATE]: z.boolean().default(true),
        [Permissions.SHARE]: z.boolean().default(true),
        [Permissions.SHARE_PUBLIC]: z.boolean().default(true),
      }),
    }),
  }),
  [SystemRoles.USER]: roleSchema.extend({
    name: z.literal(SystemRoles.USER),
    permissions: permissionsSchema,
  }),
  [SystemRoles.MANAGER]: roleSchema.extend({
    name: z.literal(SystemRoles.MANAGER),
    permissions: permissionsSchema,
  }),
  [SystemRoles.AUDITOR]: roleSchema.extend({
    name: z.literal(SystemRoles.AUDITOR),
    permissions: permissionsSchema,
  }),
});

const defaultUserPermissions = {
  [PermissionTypes.CHAT]: {
    [Permissions.USE]: true,
  },
  [PermissionTypes.PARAMETERS]: {
    [Permissions.USE]: true,
  },
  [PermissionTypes.FILE_UPLOADS]: {
    [Permissions.USE]: true,
  },
  [PermissionTypes.PROMPTS]: {
    [Permissions.USE]: true,
    [Permissions.CREATE]: true,
    [Permissions.SHARE]: false,
    [Permissions.SHARE_PUBLIC]: false,
  },
  [PermissionTypes.BOOKMARKS]: {},
  [PermissionTypes.MEMORIES]: {},
  [PermissionTypes.AGENTS]: {
    [Permissions.USE]: true,
    [Permissions.CREATE]: true,
    [Permissions.SHARE]: false,
    [Permissions.SHARE_PUBLIC]: false,
  },
  [PermissionTypes.MULTI_CONVO]: {},
  [PermissionTypes.TEMPORARY_CHAT]: {},
  [PermissionTypes.RUN_CODE]: {},
  [PermissionTypes.WEB_SEARCH]: {},
  [PermissionTypes.PEOPLE_PICKER]: {
    [Permissions.VIEW_USERS]: false,
    [Permissions.VIEW_GROUPS]: false,
    [Permissions.VIEW_ROLES]: false,
  },
  [PermissionTypes.MARKETPLACE]: {
    [Permissions.USE]: false,
  },
  [PermissionTypes.FILE_SEARCH]: {},
  [PermissionTypes.FILE_CITATIONS]: {},
  [PermissionTypes.MCP_SERVERS]: {
    [Permissions.USE]: true,
    [Permissions.CREATE]: false,
    [Permissions.SHARE]: false,
    [Permissions.SHARE_PUBLIC]: false,
  },
  [PermissionTypes.REMOTE_AGENTS]: {
    [Permissions.USE]: false,
    [Permissions.CREATE]: false,
    [Permissions.SHARE]: false,
    [Permissions.SHARE_PUBLIC]: false,
  },
};

export const roleDefaults = defaultRolesSchema.parse({
  [SystemRoles.ADMIN]: {
    name: SystemRoles.ADMIN,
    description: 'Built-in administrator role',
    isSystem: true,
    isEditable: false,
    isDeletable: false,
    permissions: {
      [PermissionTypes.CHAT]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.PARAMETERS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.FILE_UPLOADS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: true,
        [Permissions.CREATE]: true,
        [Permissions.SHARE]: true,
        [Permissions.SHARE_PUBLIC]: true,
      },
      [PermissionTypes.BOOKMARKS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.MEMORIES]: {
        [Permissions.USE]: true,
        [Permissions.CREATE]: true,
        [Permissions.UPDATE]: true,
        [Permissions.READ]: true,
        [Permissions.OPT_OUT]: true,
      },
      [PermissionTypes.AGENTS]: {
        [Permissions.USE]: true,
        [Permissions.CREATE]: true,
        [Permissions.SHARE]: true,
        [Permissions.SHARE_PUBLIC]: true,
      },
      [PermissionTypes.MULTI_CONVO]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.TEMPORARY_CHAT]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.RUN_CODE]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.WEB_SEARCH]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.PEOPLE_PICKER]: {
        [Permissions.VIEW_USERS]: true,
        [Permissions.VIEW_GROUPS]: true,
        [Permissions.VIEW_ROLES]: true,
      },
      [PermissionTypes.MARKETPLACE]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.FILE_SEARCH]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.FILE_CITATIONS]: {
        [Permissions.USE]: true,
      },
      [PermissionTypes.MCP_SERVERS]: {
        [Permissions.USE]: true,
        [Permissions.CREATE]: true,
        [Permissions.SHARE]: true,
        [Permissions.SHARE_PUBLIC]: true,
      },
      [PermissionTypes.REMOTE_AGENTS]: {
        [Permissions.USE]: true,
        [Permissions.CREATE]: true,
        [Permissions.SHARE]: true,
        [Permissions.SHARE_PUBLIC]: true,
      },
    },
  },
  [SystemRoles.USER]: {
    name: SystemRoles.USER,
    description: 'Built-in default user role',
    isSystem: true,
    isEditable: true,
    isDeletable: false,
    permissions: defaultUserPermissions,
  },
  [SystemRoles.MANAGER]: {
    name: SystemRoles.MANAGER,
    description: 'Built-in department manager role',
    isSystem: true,
    isEditable: true,
    isDeletable: false,
    permissions: defaultUserPermissions,
  },
  [SystemRoles.AUDITOR]: {
    name: SystemRoles.AUDITOR,
    description: 'Built-in read-only auditor role',
    isSystem: true,
    isEditable: true,
    isDeletable: false,
    permissions: defaultUserPermissions,
  },
});

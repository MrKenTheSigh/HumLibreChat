import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Search, ShieldCheck, Sparkles } from 'lucide-react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogOverlay,
  OGDialogPortal,
  OGDialogTitle,
} from '@librechat/client';
import { PermissionTypes, Permissions, SystemRoles } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import {
  useCreateAdminRoleMutation,
  useDeleteAdminRoleMutation,
  useGetAdminRolesQuery,
  useUpdateAdminRoleMutation,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminHelpButton from '../AdminHelpButton';
import AdminLayout from '../AdminLayout';

type RolePermissions = t.AdminRole['permissions'];

type PermissionToggleConfig = {
  permission: Permissions;
  labelKey: TranslationKeys;
};

type PermissionSectionConfig = {
  permissionType: PermissionTypes;
  sectionKey: TranslationKeys;
  permissions: PermissionToggleConfig[];
};

type PermissionCategoryConfig = {
  categoryKey: TranslationKeys;
  sections: PermissionSectionConfig[];
};

type RoleEditorModalProps = {
  role?: t.AdminRole;
  roles: t.AdminRole[];
  open: boolean;
  onClose: () => void;
};

const permissionCategories: PermissionCategoryConfig[] = [
  {
    categoryKey: 'com_ui_admin_role_category_core_chat',
    sections: [
      {
        permissionType: PermissionTypes.CHAT,
        sectionKey: 'com_ui_chat',
        permissions: [{ permission: Permissions.USE, labelKey: 'com_ui_chat_allow_use' }],
      },
      {
        permissionType: PermissionTypes.PARAMETERS,
        sectionKey: 'com_sidepanel_parameters',
        permissions: [{ permission: Permissions.USE, labelKey: 'com_ui_parameters_allow_use' }],
      },
      {
        permissionType: PermissionTypes.FILE_UPLOADS,
        sectionKey: 'com_sidepanel_attach_files',
        permissions: [{ permission: Permissions.USE, labelKey: 'com_ui_file_uploads_allow_use' }],
      },
      {
        permissionType: PermissionTypes.MULTI_CONVO,
        sectionKey: 'com_ui_multi_convo',
        permissions: [{ permission: Permissions.USE, labelKey: 'com_ui_multi_convo_allow_use' }],
      },
      {
        permissionType: PermissionTypes.TEMPORARY_CHAT,
        sectionKey: 'com_ui_temporary_chat',
        permissions: [{ permission: Permissions.USE, labelKey: 'com_ui_temporary_chat_allow_use' }],
      },
    ],
  },
  {
    categoryKey: 'com_ui_admin_role_category_content',
    sections: [
      {
        permissionType: PermissionTypes.PROMPTS,
        sectionKey: 'com_ui_prompts',
        permissions: [
          { permission: Permissions.USE, labelKey: 'com_ui_prompts_allow_use' },
          { permission: Permissions.CREATE, labelKey: 'com_ui_prompts_allow_create' },
          { permission: Permissions.SHARE, labelKey: 'com_ui_prompts_allow_share' },
          { permission: Permissions.SHARE_PUBLIC, labelKey: 'com_ui_prompts_allow_share_public' },
        ],
      },
      {
        permissionType: PermissionTypes.BOOKMARKS,
        sectionKey: 'com_ui_bookmarks',
        permissions: [{ permission: Permissions.USE, labelKey: 'com_ui_bookmarks_allow_use' }],
      },
      {
        permissionType: PermissionTypes.MEMORIES,
        sectionKey: 'com_ui_memories',
        permissions: [
          { permission: Permissions.USE, labelKey: 'com_ui_memories_allow_use' },
          { permission: Permissions.CREATE, labelKey: 'com_ui_memories_allow_create' },
          { permission: Permissions.UPDATE, labelKey: 'com_ui_memories_allow_update' },
          { permission: Permissions.READ, labelKey: 'com_ui_memories_allow_read' },
          { permission: Permissions.OPT_OUT, labelKey: 'com_ui_memories_allow_opt_out' },
        ],
      },
    ],
  },
  {
    categoryKey: 'com_ui_admin_role_category_tools',
    sections: [
      {
        permissionType: PermissionTypes.RUN_CODE,
        sectionKey: 'com_ui_run_code',
        permissions: [{ permission: Permissions.USE, labelKey: 'com_ui_run_code_allow_use' }],
      },
      {
        permissionType: PermissionTypes.WEB_SEARCH,
        sectionKey: 'com_ui_web_search',
        permissions: [{ permission: Permissions.USE, labelKey: 'com_ui_web_search_allow_use' }],
      },
      {
        permissionType: PermissionTypes.FILE_SEARCH,
        sectionKey: 'com_ui_file_search',
        permissions: [{ permission: Permissions.USE, labelKey: 'com_ui_file_search_allow_use' }],
      },
      {
        permissionType: PermissionTypes.FILE_CITATIONS,
        sectionKey: 'com_ui_file_citations',
        permissions: [{ permission: Permissions.USE, labelKey: 'com_ui_file_citations_allow_use' }],
      },
      {
        permissionType: PermissionTypes.MCP_SERVERS,
        sectionKey: 'com_ui_mcp_servers',
        permissions: [
          { permission: Permissions.USE, labelKey: 'com_ui_mcp_servers_allow_use' },
          { permission: Permissions.CREATE, labelKey: 'com_ui_mcp_servers_allow_create' },
          { permission: Permissions.SHARE, labelKey: 'com_ui_mcp_servers_allow_share' },
          {
            permission: Permissions.SHARE_PUBLIC,
            labelKey: 'com_ui_mcp_servers_allow_share_public',
          },
        ],
      },
      {
        permissionType: PermissionTypes.REMOTE_AGENTS,
        sectionKey: 'com_ui_remote_agents',
        permissions: [
          { permission: Permissions.USE, labelKey: 'com_ui_remote_agents_allow_use' },
          { permission: Permissions.CREATE, labelKey: 'com_ui_remote_agents_allow_create' },
          { permission: Permissions.SHARE, labelKey: 'com_ui_remote_agents_allow_share' },
          {
            permission: Permissions.SHARE_PUBLIC,
            labelKey: 'com_ui_remote_agents_allow_share_public',
          },
        ],
      },
    ],
  },
  {
    categoryKey: 'com_ui_admin_role_category_agents_and_sharing',
    sections: [
      {
        permissionType: PermissionTypes.AGENTS,
        sectionKey: 'com_ui_agents',
        permissions: [
          { permission: Permissions.USE, labelKey: 'com_ui_agents_allow_use' },
          { permission: Permissions.CREATE, labelKey: 'com_ui_agents_allow_create' },
          { permission: Permissions.SHARE, labelKey: 'com_ui_agents_allow_share' },
          { permission: Permissions.SHARE_PUBLIC, labelKey: 'com_ui_agents_allow_share_public' },
        ],
      },
      {
        permissionType: PermissionTypes.PEOPLE_PICKER,
        sectionKey: 'com_ui_people_picker',
        permissions: [
          { permission: Permissions.VIEW_USERS, labelKey: 'com_ui_people_picker_allow_view_users' },
          {
            permission: Permissions.VIEW_GROUPS,
            labelKey: 'com_ui_people_picker_allow_view_groups',
          },
          { permission: Permissions.VIEW_ROLES, labelKey: 'com_ui_people_picker_allow_view_roles' },
        ],
      },
      {
        permissionType: PermissionTypes.MARKETPLACE,
        sectionKey: 'com_ui_marketplace',
        permissions: [{ permission: Permissions.USE, labelKey: 'com_ui_marketplace_allow_use' }],
      },
    ],
  },
];

function clonePermissions(permissions: RolePermissions): RolePermissions {
  return Object.fromEntries(
    Object.entries(permissions).map(([permissionType, permissionValues]) => [
      permissionType,
      { ...(permissionValues ?? {}) },
    ]),
  ) as RolePermissions;
}

function createEmptyPermissions(): RolePermissions {
  const records: Partial<RolePermissions> = {};

  permissionCategories.forEach((category) => {
    category.sections.forEach((section) => {
      const permissionRecords = section.permissions.reduce<Record<string, boolean>>(
        (current, item) => ({
          ...current,
          [item.permission]: false,
        }),
        {},
      );

      Object.assign(records, {
        [section.permissionType]:
          permissionRecords as RolePermissions[typeof section.permissionType],
      });
    });
  });

  return records as RolePermissions;
}

function countEnabledPermissions(permissions: RolePermissions) {
  return Object.values(permissions).reduce((count, permissionValues) => {
    return (
      count +
      Object.values(permissionValues ?? {}).filter((permissionValue) => permissionValue === true)
        .length
    );
  }, 0);
}

function getRoleKindKey(role: t.AdminRole): TranslationKeys {
  return role.isSystem ? 'com_ui_admin_role_system' : 'com_ui_admin_role_custom';
}

function getRoleEditabilityKey(role: t.AdminRole): TranslationKeys {
  return role.isEditable === false ? 'com_ui_admin_role_locked' : 'com_ui_admin_role_editable';
}

function StatusBadge(props: { label: string; tone?: 'default' | 'warning' | 'success' }) {
  const { label, tone = 'default' } = props;

  const className =
    tone === 'warning'
      ? 'border-amber-500/35 bg-amber-500/12 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
      : tone === 'success'
        ? 'border-sky-500/35 bg-sky-500/12 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/12 dark:text-sky-100'
        : 'border-slate-400/35 bg-slate-400/12 text-slate-700 dark:text-slate-100';

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function PermissionEditor(props: {
  draftPermissions: RolePermissions;
  isEditable: boolean;
  isUpdating: boolean;
  roleName: string;
  updatePermission: (
    permissionType: PermissionTypes,
    permission: Permissions,
    value: boolean,
  ) => void;
}) {
  const { draftPermissions, isEditable, isUpdating, roleName, updatePermission } = props;
  const localize = useLocalize();

  return (
    <div className="grid gap-4">
      {permissionCategories.map((category) => (
        <section
          key={category.categoryKey}
          className="rounded-2xl border border-border-medium bg-surface-primary p-4"
        >
          <div className="mb-3">
            <h4 className="text-sm font-medium text-text-primary">
              {localize(category.categoryKey)}
            </h4>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {category.sections.map((section) => (
              <div key={section.permissionType} className="grid gap-2">
                <div className="px-1 text-sm font-medium text-text-primary">
                  {localize(section.sectionKey)}
                </div>
                <div className="rounded-2xl border border-border-medium bg-background p-4">
                  <div className="flex flex-col gap-2.5">
                    {section.permissions.map((item) => (
                      <label
                        key={`${section.permissionType}-${item.permission}`}
                        className="flex items-center justify-between gap-3 text-sm text-text-secondary"
                      >
                        <span>{localize(item.labelKey)}</span>
                        <input
                          type="checkbox"
                          checked={
                            draftPermissions?.[section.permissionType]?.[item.permission] === true
                          }
                          disabled={!isEditable || isUpdating}
                          onChange={(event) =>
                            updatePermission(
                              section.permissionType,
                              item.permission,
                              event.target.checked,
                            )
                          }
                          aria-label={`${roleName}-${section.permissionType}-${item.permission}`}
                          className="h-4 w-4 rounded border-border-medium"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RoleRow(props: { role: t.AdminRole; onOpen: (role: t.AdminRole) => void }) {
  const { role, onOpen } = props;
  const localize = useLocalize();
  const enabledPermissionCount = countEnabledPermissions(role.permissions);

  return (
    <button
      type="button"
      className="grid w-full gap-3 rounded-2xl border border-border-medium bg-background p-4 text-left transition-colors hover:bg-surface-hover"
      onClick={() => onOpen(role)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-base font-semibold text-text-primary">{role.name}</div>
            <StatusBadge label={localize(getRoleKindKey(role))} tone="success" />
            <StatusBadge
              label={localize(getRoleEditabilityKey(role))}
              tone={role.isEditable === false ? 'warning' : 'default'}
            />
            <StatusBadge
              label={`${enabledPermissionCount} ${localize('com_ui_admin_role_enabled_permissions').toLowerCase()}`}
            />
            <StatusBadge
              label={
                role.isDeletable === false
                  ? `${localize('com_ui_admin_role_deletable')}: ${localize('com_ui_no')}`
                  : `${localize('com_ui_admin_role_deletable')}: ${localize('com_ui_yes')}`
              }
            />
          </div>
        </div>
        <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-secondary" />
      </div>
    </button>
  );
}

function RoleEditorModal({ role, roles, open, onClose }: RoleEditorModalProps) {
  const localize = useLocalize();
  const isCreateMode = role == null;
  const createMutation = useCreateAdminRoleMutation();
  const updateMutation = useUpdateAdminRoleMutation();
  const deleteMutation = useDeleteAdminRoleMutation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateRole, setTemplateRole] = useState<string>(SystemRoles.USER);
  const [draftPermissions, setDraftPermissions] =
    useState<RolePermissions>(createEmptyPermissions());
  const [showLockedHelp, setShowLockedHelp] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (role != null) {
      setName(role.name);
      setDescription(role.description ?? '');
      setTemplateRole(role.name);
      setDraftPermissions(clonePermissions(role.permissions));
      setShowLockedHelp(false);
      return;
    }

    const fallbackRole =
      roles.find((item) => item.name === SystemRoles.USER)?.name ??
      roles[0]?.name ??
      SystemRoles.USER;
    const fallbackPermissions =
      roles.find((item) => item.name === fallbackRole)?.permissions ?? createEmptyPermissions();

    setName('');
    setDescription('');
    setTemplateRole(fallbackRole);
    setDraftPermissions(clonePermissions(fallbackPermissions));
    setShowLockedHelp(false);
  }, [open, role, roles]);

  useEffect(() => {
    if (!open || role != null) {
      return;
    }

    const nextTemplate = roles.find((item) => item.name === templateRole);
    if (nextTemplate == null) {
      return;
    }

    setDraftPermissions(clonePermissions(nextTemplate.permissions));
  }, [open, role, roles, templateRole]);

  const enabledPermissionCount = useMemo(
    () => countEnabledPermissions(draftPermissions),
    [draftPermissions],
  );

  const mutationError =
    createMutation.error?.response?.data?.message ??
    createMutation.error?.message ??
    updateMutation.error?.response?.data?.message ??
    updateMutation.error?.message ??
    deleteMutation.error?.response?.data?.message ??
    deleteMutation.error?.message;

  const updatePermission = (
    permissionType: PermissionTypes,
    permission: Permissions,
    value: boolean,
  ) => {
    setDraftPermissions((current) => ({
      ...current,
      [permissionType]: {
        ...(current[permissionType] ?? {}),
        [permission]: value,
      },
    }));
  };

  const submitDisabled =
    createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading;
  return (
    <OGDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <OGDialogPortal>
        <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
        <OGDialogContent
          className="admin-console fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(1120px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary p-0 shadow-2xl focus:outline-none"
          showCloseButton={true}
        >
          <OGDialogTitle className="sr-only">
            {isCreateMode ? localize('com_ui_admin_create_role') : localize('com_ui_admin_roles')}
          </OGDialogTitle>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();

              if (isCreateMode) {
                createMutation.mutate(
                  {
                    name: name.trim(),
                    description: description.trim() || null,
                    permissions: draftPermissions,
                  },
                  {
                    onSuccess: () => onClose(),
                  },
                );
                return;
              }

              if (!role) {
                return;
              }

              updateMutation.mutate(
                {
                  roleName: role.name,
                  description: description.trim() || null,
                  permissions: draftPermissions,
                },
                {
                  onSuccess: () => onClose(),
                },
              );
            }}
          >
            <div className="shrink-0 border-b border-border-light px-6 py-5">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-semibold text-text-primary">
                        {isCreateMode ? localize('com_ui_admin_create_role') : name}
                      </h2>
                      {role && (
                        <StatusBadge label={localize(getRoleKindKey(role))} tone="success" />
                      )}
                      {role && (
                        <button
                          type="button"
                          className="rounded-full"
                          onClick={() =>
                            role.isEditable === false && setShowLockedHelp((current) => !current)
                          }
                        >
                          <StatusBadge
                            label={localize(getRoleEditabilityKey(role))}
                            tone={role.isEditable === false ? 'warning' : 'default'}
                          />
                        </button>
                      )}
                      <StatusBadge
                        label={`${enabledPermissionCount} ${localize('com_ui_admin_role_enabled_permissions').toLowerCase()}`}
                      />
                    </div>
                    {role?.isEditable === false && showLockedHelp && (
                      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        {localize('com_ui_admin_role_locked_description')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="grid gap-6">
                <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-text-primary">
                      {localize('com_ui_admin_role_metadata_title')}
                    </h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm text-text-secondary">
                      {localize('com_ui_name')}
                      <input
                        required={true}
                        disabled={!isCreateMode}
                        value={name}
                        onChange={(event) => setName(event.target.value.toUpperCase())}
                        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                    {isCreateMode && (
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_admin_role_template')}
                        <select
                          value={templateRole}
                          onChange={(event) => setTemplateRole(event.target.value)}
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                        >
                          {roles.map((item) => (
                            <option key={item.name} value={item.name}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="flex flex-col gap-2 text-sm text-text-secondary md:col-span-2">
                      {localize('com_ui_description')}
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        disabled={role?.isEditable === false || updateMutation.isLoading}
                        rows={3}
                        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-text-primary">
                      {localize('com_ui_admin_role_permissions_title')}
                    </h3>
                  </div>
                  <PermissionEditor
                    draftPermissions={draftPermissions}
                    isEditable={role?.isEditable !== false}
                    isUpdating={submitDisabled}
                    roleName={name || role?.name || localize('com_ui_unknown')}
                    updatePermission={updatePermission}
                  />
                </section>

                {mutationError && (
                  <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {mutationError}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-border-light px-6 py-5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={submitDisabled || name.trim().length === 0}
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreateMode ? localize('com_ui_create') : localize('com_ui_save_changes')}
                </button>
                {!isCreateMode && role && (
                  <button
                    type="button"
                    disabled={role.isDeletable === false || submitDisabled}
                    className="admin-button-danger rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      if (!window.confirm(localize('com_ui_admin_delete_role_confirm'))) {
                        return;
                      }

                      deleteMutation.mutate(role.name, {
                        onSuccess: () => onClose(),
                      });
                    }}
                  >
                    {localize('com_ui_delete')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitDisabled}
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {localize('com_ui_cancel')}
                </button>
              </div>
            </div>
          </form>
        </OGDialogContent>
      </OGDialogPortal>
    </OGDialog>
  );
}

export default function AdminRolesPage() {
  const pageSize = 20;
  const localize = useLocalize();
  const rolesQuery = useGetAdminRolesQuery();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<t.AdminRole | undefined>(undefined);
  const roles = rolesQuery.data?.roles ?? [];
  const deferredSearch = search.trim().toLowerCase();
  const filteredRoles = useMemo(() => {
    if (deferredSearch.length === 0) {
      return roles;
    }

    return roles.filter((role) => {
      const haystack = `${role.name} ${role.description ?? ''}`.toLowerCase();
      return haystack.includes(deferredSearch);
    });
  }, [deferredSearch, roles]);
  const totalPages = Math.max(1, Math.ceil(filteredRoles.length / pageSize));
  const pagedRoles = filteredRoles.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  return (
    <AdminLayout title={localize('com_ui_admin_roles')} hideHeader={true}>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <section className="shrink-0 rounded-3xl border border-border-medium bg-surface-primary p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2">
                <div className="text-lg font-medium text-text-primary">
                  {localize('com_ui_admin_roles')}
                </div>
                <AdminHelpButton
                  title="com_ui_admin_roles"
                  description="com_ui_admin_roles_description"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border-light bg-background px-3 py-1.5 text-xs font-medium text-text-secondary">
                {localize('com_ui_results_found', { count: filteredRoles.length })}
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {localize('com_ui_admin_create_role')}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_search')}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={localize('com_ui_search')}
                  className="w-full rounded-xl border border-border-medium bg-background py-2 pl-9 pr-3 text-sm text-text-primary"
                />
              </div>
            </label>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {rolesQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_admin_empty_roles')}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pagedRoles.map((role) => (
                  <RoleRow key={role.name} role={role} onOpen={setSelectedRole} />
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light px-5 py-4">
            <div className="text-sm text-text-secondary">
              {localize('com_ui_page')} {page}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {localize('com_ui_back')}
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                {localize('com_ui_admin_next_page')}
              </button>
            </div>
          </div>
        </section>

        <RoleEditorModal
          open={showCreateModal}
          roles={roles}
          onClose={() => setShowCreateModal(false)}
        />
        <RoleEditorModal
          open={selectedRole != null}
          role={selectedRole}
          roles={roles}
          onClose={() => setSelectedRole(undefined)}
        />
      </div>
    </AdminLayout>
  );
}

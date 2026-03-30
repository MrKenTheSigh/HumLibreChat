import { useEffect, useMemo, useState } from 'react';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogPortal,
  OGDialogOverlay,
  OGDialogContent,
} from '@librechat/client';
import type { TRole } from 'librechat-data-provider';
import { SystemRoles } from 'librechat-data-provider';
import { useGetAdminRolesQuery, useUpdateAdminUserRoleMutation } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';

function getEnabledPermissionLabels(permissions: TRole['permissions']) {
  return Object.entries(permissions).flatMap(([permissionType, permissionValues]) =>
    Object.entries(permissionValues ?? {})
      .filter(([, isEnabled]) => isEnabled === true)
      .map(([permission]) => `${permissionType}.${permission}`),
  );
}

export default function AdminUserRoleCard(props: {
  userId: string;
  currentRole: string | null;
  canChangeRole: boolean;
  isPrimaryAdminProtected: boolean;
}) {
  const { userId, currentRole, canChangeRole, isPrimaryAdminProtected } = props;
  const localize = useLocalize();
  const rolesQuery = useGetAdminRolesQuery();
  const updateRoleMutation = useUpdateAdminUserRoleMutation();
  const [selectedRole, setSelectedRole] = useState(currentRole ?? SystemRoles.USER);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const availableRoles = rolesQuery.data?.roles ?? [];
  const selectedRoleDefinition = availableRoles.find((role) => role.name === selectedRole);
  const enabledPermissions = useMemo(
    () =>
      selectedRoleDefinition != null
        ? getEnabledPermissionLabels(selectedRoleDefinition.permissions)
        : [],
    [selectedRoleDefinition],
  );

  useEffect(() => {
    if (currentRole != null && currentRole.length > 0) {
      setSelectedRole(currentRole);
      return;
    }

    const fallbackRole =
      availableRoles.find((role) => role.name === SystemRoles.USER)?.name ??
      availableRoles[0]?.name;
    if (fallbackRole != null) {
      setSelectedRole(fallbackRole);
    }
  }, [availableRoles, currentRole]);

  const disabledReason = isPrimaryAdminProtected
    ? localize('com_ui_admin_primary_admin_locked')
    : !canChangeRole
      ? localize('com_ui_admin_role_change_unavailable')
      : null;
  const currentRoleLabel = currentRole ?? localize('com_ui_unknown');
  const currentAssignmentLabel =
    selectedRole !== currentRoleLabel ? `${currentRoleLabel} > ${selectedRole}` : currentRoleLabel;

  return (
    <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-text-primary">
          {localize('com_ui_admin_role_assignment_title')}
        </h2>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border-medium bg-background p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_ui_admin_current_role')}
            </div>
            <div className="mt-2 text-sm font-medium text-text-primary">
              {currentAssignmentLabel}
            </div>
          </div>
          <div className="rounded-2xl border border-border-medium bg-background p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_ui_admin_permission')}
            </div>
            {enabledPermissions.length === 0 ? (
              <div className="mt-2 text-sm font-medium text-text-primary">
                {localize('com_ui_none')}
              </div>
            ) : (
              <button
                type="button"
                className="mt-2 flex w-full flex-wrap gap-2 text-left"
                onClick={() => setShowPermissionsModal(true)}
              >
                {enabledPermissions.slice(0, 6).map((permissionLabel) => (
                  <span
                    key={permissionLabel}
                    className="inline-flex rounded-full border border-border-light bg-surface-primary px-2.5 py-1 text-xs font-medium text-text-secondary"
                  >
                    {permissionLabel}
                  </span>
                ))}
                {enabledPermissions.length > 6 && (
                  <span className="inline-flex rounded-full border border-border-light bg-surface-primary px-2.5 py-1 text-xs font-medium text-text-secondary">
                    {localize('com_ui_admin_permissions_more', {
                      count: enabledPermissions.length - 6,
                    })}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border-medium bg-background p-4">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_admin_assignment')}
              <select
                value={selectedRole}
                onChange={(event) => setSelectedRole(event.target.value)}
                disabled={!canChangeRole || rolesQuery.isLoading || availableRoles.length === 0}
                className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {availableRoles.map((role) => (
                  <option key={role.name} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={
                !canChangeRole ||
                updateRoleMutation.isLoading ||
                rolesQuery.isLoading ||
                selectedRole.length === 0 ||
                selectedRole === (currentRole ?? '')
              }
              onClick={() => updateRoleMutation.mutate({ userId, roleName: selectedRole })}
              className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {localize('com_ui_save')}
            </button>
          </div>
        </div>
      </div>

      {disabledReason && (
        <p className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {disabledReason}
        </p>
      )}

      {updateRoleMutation.error != null && (
        <p className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {updateRoleMutation.error.response?.data?.message ??
            updateRoleMutation.error.message ??
            localize('com_ui_error')}
        </p>
      )}

      <OGDialog open={showPermissionsModal} onOpenChange={setShowPermissionsModal}>
        <OGDialogPortal>
          <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
          <OGDialogContent
            className="admin-console fixed left-1/2 top-1/2 z-50 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border-medium bg-surface-primary p-6 shadow-2xl focus:outline-none"
            showCloseButton={true}
          >
            <OGDialogTitle className="text-lg font-semibold text-text-primary">
              {selectedRole}
            </OGDialogTitle>
            <div className="mt-4 flex flex-wrap gap-2">
              {enabledPermissions.map((permissionLabel) => (
                <span
                  key={permissionLabel}
                  className="inline-flex rounded-full border border-border-light bg-background px-2.5 py-1 text-xs font-medium text-text-secondary"
                >
                  {permissionLabel}
                </span>
              ))}
            </div>
          </OGDialogContent>
        </OGDialogPortal>
      </OGDialog>
    </section>
  );
}

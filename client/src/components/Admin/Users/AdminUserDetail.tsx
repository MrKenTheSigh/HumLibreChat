import { ShieldAlert, UserRound } from 'lucide-react';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogPortal,
  OGDialogOverlay,
  OGDialogContent,
} from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import { useGetStartupConfig } from '~/data-provider';
import { useGetAdminUserQuery } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import formatAdminDateTime from '../formatAdminDateTime';
import AdminUserBalanceCard from './AdminUserBalanceCard';
import AdminUserDepartmentCard from './AdminUserDepartmentCard';
import AdminUserIdentityCard from './AdminUserIdentityCard';
import AdminUserPlanCard from './AdminUserPlanCard';
import AdminUserProvisioningCard from './AdminUserProvisioningCard';
import AdminUserRoleCard from './AdminUserRoleCard';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-medium bg-background p-4">
      <div className="text-xs uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="mt-2 text-sm text-text-primary">{value}</div>
    </div>
  );
}

function StatusPill(props: { label: string; tone?: 'default' | 'warning' }) {
  const { label, tone = 'default' } = props;

  return (
    <span
      className={
        tone === 'warning'
          ? 'inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200'
          : 'inline-flex rounded-full border border-border-light bg-background px-3 py-1 text-xs font-medium text-text-secondary'
      }
    >
      {label}
    </span>
  );
}

export default function AdminUserDetail() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { userId = '' } = useParams();
  const { data: startupConfig } = useGetStartupConfig();
  const userQuery = useGetAdminUserQuery(userId, { enabled: userId.length > 0 });

  const closeModal = () => navigate('/d/admin/users');

  if (userQuery.isLoading) {
    return (
      <OGDialog open={true} onOpenChange={(open) => !open && closeModal()}>
        <OGDialogPortal>
          <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
          <OGDialogContent
            className="admin-console fixed left-1/2 top-1/2 z-50 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border-medium bg-surface-primary p-6 shadow-2xl focus:outline-none"
            showCloseButton={true}
          >
            <OGDialogTitle className="text-lg font-semibold text-text-primary">
              {localize('com_ui_admin_user_details')}
            </OGDialogTitle>
            <div className="mt-4 rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
              {localize('com_ui_loading')}
            </div>
          </OGDialogContent>
        </OGDialogPortal>
      </OGDialog>
    );
  }

  if (!userQuery.data) {
    return (
      <OGDialog open={true} onOpenChange={(open) => !open && closeModal()}>
        <OGDialogPortal>
          <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
          <OGDialogContent
            className="admin-console fixed left-1/2 top-1/2 z-50 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border-medium bg-surface-primary p-6 shadow-2xl focus:outline-none"
            showCloseButton={true}
          >
            <OGDialogTitle className="text-lg font-semibold text-text-primary">
              {localize('com_ui_admin_user_details')}
            </OGDialogTitle>
            <p className="mt-4 text-sm text-text-secondary">
              {localize('com_ui_no_results_found')}
            </p>
          </OGDialogContent>
        </OGDialogPortal>
      </OGDialog>
    );
  }

  const user = userQuery.data;
  const roleManagement = user.roleManagement ?? {
    isPrimaryAdminProtected: false,
    canChangeRole: true,
    canDelete: true,
  };
  const displayName = user.name || user.username || localize('com_ui_unknown');

  return (
    <OGDialog open={true} onOpenChange={(open) => !open && closeModal()}>
      <OGDialogPortal>
        <OGDialogOverlay className="bg-black/55 backdrop-blur-sm" />
        <OGDialogContent
          className="admin-console fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(1120px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary p-0 shadow-2xl focus:outline-none"
          showCloseButton={true}
        >
          <OGDialogTitle className="sr-only">{localize('com_ui_admin_user_details')}</OGDialogTitle>

          <div className="shrink-0 border-b border-border-light px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background text-text-primary">
                <UserRound className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-3">
                <div>
                  <h2 className="text-2xl font-semibold text-text-primary">{displayName}</h2>
                  <p className="text-sm text-text-secondary">{user.email}</p>
                </div>
                {roleManagement.isPrimaryAdminProtected && (
                  <StatusPill label={localize('com_ui_admin_protected_admin')} tone="warning" />
                )}
              </div>
            </div>

            {roleManagement.isPrimaryAdminProtected && (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-200" aria-hidden="true" />
                <div>
                  <div className="text-sm font-medium text-amber-100">
                    {localize('com_ui_admin_protected_admin_title')}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-amber-100/90">
                    {localize('com_ui_admin_primary_admin_locked')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-6">
              <AdminUserIdentityCard
                userId={user.id}
                name={user.name}
                username={user.username}
                email={user.email}
              />

              <AdminUserRoleCard
                userId={user.id}
                currentRole={user.role}
                canChangeRole={roleManagement.canChangeRole}
                isPrimaryAdminProtected={roleManagement.isPrimaryAdminProtected}
              />

              <AdminUserDepartmentCard
                userId={user.id}
                currentDepartment={user.department}
                assignedAt={user.departmentAssignedAt}
              />

              {startupConfig?.balance?.enabled && (
                <AdminUserBalanceCard userId={user.id} tokenCredits={user.balance.tokenCredits} />
              )}

              {startupConfig?.balance?.enabled !== true && (
                <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
                  <h2 className="text-sm font-medium text-text-primary">
                    {localize('com_nav_balance')}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    {localize('com_ui_admin_balance_disabled')}
                  </p>
                </section>
              )}

              <AdminUserPlanCard
                userId={user.id}
                currentPlan={user.plan}
                assignedAt={user.planAssignedAt}
              />

              <AdminUserProvisioningCard
                userId={user.id}
                currentPlan={user.plan}
                provisioning={user.provisioning}
              />

              <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-medium text-text-primary">
                    {localize('com_ui_admin_user_metadata_title')}
                  </h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <DetailRow
                    label={localize('com_ui_admin_email_verified')}
                    value={user.emailVerified ? localize('com_ui_yes') : localize('com_ui_no')}
                  />
                  <DetailRow
                    label={localize('com_ui_admin_two_factor')}
                    value={user.twoFactorEnabled ? localize('com_ui_yes') : localize('com_ui_no')}
                  />
                  <DetailRow
                    label={localize('com_ui_admin_terms_accepted')}
                    value={user.termsAccepted ? localize('com_ui_yes') : localize('com_ui_no')}
                  />
                  <DetailRow
                    label={localize('com_ui_admin_favorites')}
                    value={String(user.favoritesCount)}
                  />
                  <DetailRow
                    label={localize('com_ui_admin_memories_enabled')}
                    value={
                      user.personalization.memories ? localize('com_ui_yes') : localize('com_ui_no')
                    }
                  />
                  <DetailRow
                    label={localize('com_ui_admin_current_department')}
                    value={
                      user.department
                        ? `${user.department.name} (${user.department.code})`
                        : localize('com_ui_none')
                    }
                  />
                  <DetailRow
                    label={localize('com_ui_admin_created_at')}
                    value={formatAdminDateTime(user.createdAt)}
                  />
                  <DetailRow
                    label={localize('com_ui_admin_updated_at')}
                    value={formatAdminDateTime(user.updatedAt)}
                  />
                  <DetailRow
                    label={localize('com_ui_admin_current_plan')}
                    value={
                      user.plan ? `${user.plan.name} (${user.plan.slug})` : localize('com_ui_none')
                    }
                  />
                </div>
              </section>
            </div>
          </div>
        </OGDialogContent>
      </OGDialogPortal>
    </OGDialog>
  );
}

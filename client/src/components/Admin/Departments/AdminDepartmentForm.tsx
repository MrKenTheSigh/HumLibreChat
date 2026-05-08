import { useEffect, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogOverlay,
  OGDialogPortal,
  OGDialogTitle,
} from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import type { TError } from 'librechat-data-provider';
import {
  useCreateAdminDepartmentMutation,
  useDeleteAdminDepartmentMutation,
  useGetAdminDepartmentQuery,
  useGetAdminDepartmentsQuery,
  useGetAdminUsersQuery,
  useUpdateAdminDepartmentMutation,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminHelpButton from '../AdminHelpButton';

type DepartmentFormState = {
  code: string;
  name: string;
  description: string;
  parentDepartmentId: string;
  managerUserId: string;
  enabled: boolean;
  sortOrder: string;
};

const emptyDepartmentState: DepartmentFormState = {
  code: '',
  name: '',
  description: '',
  parentDepartmentId: '',
  managerUserId: '',
  enabled: true,
  sortOrder: '0',
};

function toErrorMessage(error: TError | null | undefined): string | null {
  return error?.response?.data?.message ?? error?.message ?? null;
}

function StatusBadge({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span
      className={
        active
          ? 'inline-flex rounded-full border border-border-medium bg-background px-3 py-1 text-xs font-medium text-text-primary'
          : 'inline-flex rounded-full border border-border-light bg-surface-hover px-3 py-1 text-xs font-medium text-text-secondary'
      }
    >
      {label}
    </span>
  );
}

export default function AdminDepartmentForm() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { departmentId = '' } = useParams();
  const isCreateMode = departmentId.length === 0;
  const [form, setForm] = useState<DepartmentFormState>(emptyDepartmentState);
  const departmentQuery = useGetAdminDepartmentQuery(departmentId, {
    enabled: isCreateMode !== true && departmentId.length > 0,
  });
  const departmentsQuery = useGetAdminDepartmentsQuery({});
  const usersQuery = useGetAdminUsersQuery({ limit: 100 });
  const createMutation = useCreateAdminDepartmentMutation();
  const updateMutation = useUpdateAdminDepartmentMutation();
  const deleteMutation = useDeleteAdminDepartmentMutation();

  useEffect(() => {
    if (!departmentQuery.data) {
      return;
    }

    setForm({
      code: departmentQuery.data.code,
      name: departmentQuery.data.name,
      description: departmentQuery.data.description,
      parentDepartmentId: departmentQuery.data.parentDepartmentId ?? '',
      managerUserId: departmentQuery.data.managerUserId ?? '',
      enabled: departmentQuery.data.enabled,
      sortOrder: String(departmentQuery.data.sortOrder),
    });
  }, [departmentQuery.data]);

  const parentDepartments = useMemo(
    () =>
      (departmentsQuery.data?.departments ?? []).filter(
        (department) => department.id !== departmentId,
      ),
    [departmentsQuery.data?.departments, departmentId],
  );
  const users = usersQuery.data?.users ?? [];
  const mutationError =
    toErrorMessage(createMutation.error) ??
    toErrorMessage(updateMutation.error) ??
    toErrorMessage(deleteMutation.error);
  const submitDisabled =
    createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading;
  const closeModal = () => navigate('/d/admin/departments');

  return (
    <OGDialog open={true} onOpenChange={(open) => !open && closeModal()}>
      <OGDialogPortal>
        <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
        <OGDialogContent
          className="admin-console fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary p-0 shadow-2xl focus:outline-none"
          showCloseButton={true}
        >
          <OGDialogTitle className="sr-only">
            {isCreateMode
              ? localize('com_ui_admin_create_department')
              : localize('com_ui_admin_department_details')}
          </OGDialogTitle>

          <div className="shrink-0 border-b border-border-light px-6 py-5">
            {!isCreateMode && departmentQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : !isCreateMode && !departmentQuery.data ? (
              <p className="text-sm text-text-secondary">{localize('com_ui_no_results_found')}</p>
            ) : (
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                    <Building2 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-semibold text-text-primary">
                        {isCreateMode
                          ? localize('com_ui_admin_create_department')
                          : form.name || localize('com_ui_admin_department_details')}
                      </h2>
                      <AdminHelpButton
                        title="com_ui_admin_department_details"
                        description="com_ui_admin_department_details_description"
                      />
                      <StatusBadge
                        active={form.enabled}
                        label={
                          form.enabled
                            ? localize('com_ui_admin_enabled')
                            : localize('com_ui_admin_disabled')
                        }
                      />
                      {form.code.length > 0 && <StatusBadge active={true} label={form.code} />}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!(!isCreateMode && (departmentQuery.isLoading || !departmentQuery.data)) && (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();

                const payload = {
                  name: form.name.trim(),
                  description: form.description.trim(),
                  parentDepartmentId:
                    form.parentDepartmentId.length === 0 ? null : form.parentDepartmentId,
                  managerUserId: form.managerUserId.length === 0 ? null : form.managerUserId,
                  enabled: form.enabled,
                  sortOrder: Number(form.sortOrder || '0'),
                };

                if (isCreateMode) {
                  createMutation.mutate(
                    {
                      code: form.code.trim(),
                      ...payload,
                    },
                    {
                      onSuccess: (department) => {
                        navigate(`/d/admin/departments/${department.id}`);
                      },
                    },
                  );
                  return;
                }

                updateMutation.mutate(
                  {
                    departmentId,
                    ...payload,
                  },
                  {
                    onSuccess: () => {
                      navigate(`/d/admin/departments/${departmentId}`);
                    },
                  },
                );
              }}
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="grid gap-6">
                  <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
                    <div className="mb-4">
                      <h2 className="text-sm font-medium text-text-primary">
                        {localize('com_ui_admin_department_identity_title')}
                      </h2>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_name')}
                        <input
                          required={true}
                          value={form.name}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, name: event.target.value }))
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_admin_department_code')}
                        <input
                          required={true}
                          disabled={!isCreateMode}
                          value={form.code}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              code: event.target.value.toUpperCase(),
                            }))
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary disabled:opacity-70"
                        />
                      </label>
                    </div>

                    <label className="mt-4 flex flex-col gap-2 text-sm text-text-secondary">
                      {localize('com_ui_description')}
                      <textarea
                        rows={3}
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, description: event.target.value }))
                        }
                        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                      />
                    </label>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_admin_sort_order')}
                        <input
                          type="number"
                          value={form.sortOrder}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, sortOrder: event.target.value }))
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                        />
                      </label>
                      <label className="flex items-center gap-3 rounded-xl border border-border-medium bg-background px-4 py-3 text-sm text-text-primary md:self-end">
                        <input
                          type="checkbox"
                          checked={form.enabled}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, enabled: event.target.checked }))
                          }
                        />
                        {localize('com_ui_admin_enabled')}
                      </label>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
                    <div className="mb-4">
                      <h2 className="text-sm font-medium text-text-primary">
                        {localize('com_ui_admin_department_relationships_title')}
                      </h2>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_admin_parent_department')}
                        <select
                          value={form.parentDepartmentId}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              parentDepartmentId: event.target.value,
                            }))
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                        >
                          <option value="">{localize('com_ui_none')}</option>
                          {parentDepartments.map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name} ({department.code})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_admin_department_manager')}
                        <select
                          value={form.managerUserId}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              managerUserId: event.target.value,
                            }))
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                        >
                          <option value="">{localize('com_ui_none')}</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name || user.username || user.email} ({user.email})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
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
                    disabled={submitDisabled}
                    className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreateMode ? localize('com_ui_create') : localize('com_ui_save_changes')}
                  </button>
                  {!isCreateMode && (
                    <button
                      type="button"
                      disabled={submitDisabled}
                      className="admin-button-danger rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        if (!window.confirm(localize('com_ui_admin_delete_department_confirm'))) {
                          return;
                        }

                        deleteMutation.mutate(departmentId, {
                          onSuccess: () => {
                            closeModal();
                          },
                        });
                      }}
                    >
                      {localize('com_ui_delete')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitDisabled}
                    className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {localize('com_ui_cancel')}
                  </button>
                </div>
              </div>
            </form>
          )}
        </OGDialogContent>
      </OGDialogPortal>
    </OGDialog>
  );
}

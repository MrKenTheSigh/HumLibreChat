import { useMemo, useState } from 'react';
import type { AdminDepartmentSummary } from 'librechat-data-provider';
import {
  useGetAdminDepartmentsQuery,
  useUpdateAdminUserDepartmentMutation,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import formatAdminDateTime from '../formatAdminDateTime';

function getErrorMessage(error: unknown): string | null {
  if (
    error != null &&
    typeof error === 'object' &&
    'response' in error &&
    error.response != null &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data != null &&
    typeof error.response.data === 'object' &&
    'message' in error.response.data &&
    typeof error.response.data.message === 'string'
  ) {
    return error.response.data.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return null;
}

type AdminUserDepartmentCardProps = {
  userId: string;
  currentDepartment: AdminDepartmentSummary | null;
  assignedAt: string | null;
};

export default function AdminUserDepartmentCard({
  userId,
  currentDepartment,
  assignedAt,
}: AdminUserDepartmentCardProps) {
  const localize = useLocalize();
  const departmentsQuery = useGetAdminDepartmentsQuery({ enabled: true });
  const assignMutation = useUpdateAdminUserDepartmentMutation();
  const departments = departmentsQuery.data?.departments ?? [];
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(currentDepartment?.id ?? '');
  const selectedDepartment = useMemo(
    () => departments.find((department) => department.id === selectedDepartmentId) ?? null,
    [departments, selectedDepartmentId],
  );
  const currentDepartmentLabel = currentDepartment
    ? `${currentDepartment.name} (${currentDepartment.code})`
    : localize('com_ui_none');
  const nextDepartmentLabel = selectedDepartment
    ? `${selectedDepartment.name} (${selectedDepartment.code})`
    : null;
  const currentDisplayValue =
    nextDepartmentLabel != null && selectedDepartmentId !== currentDepartment?.id
      ? `${currentDepartmentLabel} > ${nextDepartmentLabel}`
      : currentDepartmentLabel;
  const errorMessage = getErrorMessage(assignMutation.error);

  return (
    <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-text-primary">
          {localize('com_ui_admin_department_assignment_title')}
        </h2>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border-medium bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-text-secondary">
            {localize('com_ui_admin_current_department')}
          </div>
          <div className="mt-2 text-sm text-text-primary">{currentDisplayValue}</div>
          <div className="mt-2 text-xs text-text-secondary">
            {assignedAt
              ? formatAdminDateTime(assignedAt)
              : localize('com_ui_admin_department_unassigned')}
          </div>
        </div>

        <div className="rounded-2xl border border-border-medium bg-background p-4">
          {departmentsQuery.isLoading ? (
            <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>
          ) : departments.length === 0 ? (
            <div className="text-sm text-text-secondary">
              {localize('com_ui_admin_no_departments_available')}
            </div>
          ) : (
            <div className="grid gap-3">
              <select
                value={selectedDepartmentId}
                onChange={(event) => setSelectedDepartmentId(event.target.value)}
                className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
              >
                <option value="">{localize('com_ui_select')}</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name} ({department.code})
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={selectedDepartmentId.length === 0 || assignMutation.isLoading}
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    assignMutation.mutate({
                      userId,
                      departmentId: selectedDepartmentId,
                    });
                  }}
                >
                  {localize('com_ui_admin_assign_department')}
                </button>
                <button
                  type="button"
                  disabled={currentDepartment == null || assignMutation.isLoading}
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    assignMutation.mutate({
                      userId,
                      departmentId: null,
                    });
                    setSelectedDepartmentId('');
                  }}
                >
                  {localize('com_ui_admin_clear_department')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      )}
    </section>
  );
}

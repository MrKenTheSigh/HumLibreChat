import type { ChangeEvent } from 'react';
import { useLocalize } from '~/hooks';
import AdminDateTimePicker from '../AdminDateTimePicker';

type AdminUsageFiltersProps = {
  departmentId: string;
  canSelectDepartment: boolean;
  departments: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  userId: string;
  model: string;
  context: string;
  tokenType: 'all' | 'prompt' | 'completion' | 'credits';
  dateFrom: string;
  dateTo: string;
  onDepartmentIdChange: (value: string) => void;
  onUserIdChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onTokenTypeChange: (value: 'all' | 'prompt' | 'completion' | 'credits') => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
};

const tokenTypeOptions: Array<'all' | 'prompt' | 'completion' | 'credits'> = [
  'all',
  'prompt',
  'completion',
  'credits',
];

export default function AdminUsageFilters({
  departmentId,
  canSelectDepartment,
  departments,
  userId,
  model,
  context,
  tokenType,
  dateFrom,
  dateTo,
  onDepartmentIdChange,
  onUserIdChange,
  onModelChange,
  onContextChange,
  onTokenTypeChange,
  onDateFromChange,
  onDateToChange,
}: AdminUsageFiltersProps) {
  const localize = useLocalize();

  const handleChange =
    (callback: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) =>
      callback(event.target.value);

  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {canSelectDepartment ? (
        <select
          value={departmentId}
          onChange={(event) => onDepartmentIdChange(event.target.value)}
          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
          aria-label={localize('com_ui_admin_department')}
        >
          <option value="">{localize('com_ui_all_proper')}</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.code} - {department.name}
            </option>
          ))}
        </select>
      ) : null}
      <input
        type="text"
        value={userId}
        onChange={handleChange(onUserIdChange)}
        placeholder={localize('com_ui_admin_user_id_placeholder')}
        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
      />
      <input
        type="text"
        value={model}
        onChange={handleChange(onModelChange)}
        placeholder={localize('com_ui_model')}
        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
      />
      <input
        type="text"
        value={context}
        onChange={handleChange(onContextChange)}
        placeholder={localize('com_ui_context')}
        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
      />
      <select
        value={tokenType}
        onChange={(event) =>
          onTokenTypeChange(event.target.value as 'all' | 'prompt' | 'completion' | 'credits')
        }
        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
        aria-label={localize('com_ui_admin_token_type')}
      >
        {tokenTypeOptions.map((option) => (
          <option key={option} value={option}>
            {option === 'all' ? localize('com_ui_all_proper') : option}
          </option>
        ))}
      </select>
      <AdminDateTimePicker
        value={dateFrom}
        onChange={onDateFromChange}
        ariaLabel={localize('com_ui_admin_date_from')}
      />
      <AdminDateTimePicker
        value={dateTo}
        onChange={onDateToChange}
        ariaLabel={localize('com_ui_admin_date_to')}
      />
    </div>
  );
}

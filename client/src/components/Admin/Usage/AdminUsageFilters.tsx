import type { ChangeEvent } from 'react';
import { useLocalize } from '~/hooks';

type AdminUsageFiltersProps = {
  userId: string;
  model: string;
  context: string;
  tokenType: string;
  dateFrom: string;
  dateTo: string;
  onUserIdChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onTokenTypeChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
};

const tokenTypeOptions = ['all', 'prompt', 'completion', 'credits'];

export default function AdminUsageFilters({
  userId,
  model,
  context,
  tokenType,
  dateFrom,
  dateTo,
  onUserIdChange,
  onModelChange,
  onContextChange,
  onTokenTypeChange,
  onDateFromChange,
  onDateToChange,
}: AdminUsageFiltersProps) {
  const localize = useLocalize();

  const handleChange = (callback: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) =>
    callback(event.target.value);

  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <input
        type="text"
        value={userId}
        onChange={handleChange(onUserIdChange)}
        placeholder={localize('com_ui_admin_user_id_placeholder')}
        className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
      />
      <input
        type="text"
        value={model}
        onChange={handleChange(onModelChange)}
        placeholder={localize('com_ui_model')}
        className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
      />
      <input
        type="text"
        value={context}
        onChange={handleChange(onContextChange)}
        placeholder={localize('com_ui_context')}
        className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
      />
      <select
        value={tokenType}
        onChange={(event) => onTokenTypeChange(event.target.value)}
        className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
        aria-label={localize('com_ui_admin_token_type')}
      >
        {tokenTypeOptions.map((option) => (
          <option key={option} value={option}>
            {option === 'all' ? localize('com_ui_all_proper') : option}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={dateFrom}
        onChange={handleChange(onDateFromChange)}
        className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
        aria-label={localize('com_ui_admin_date_from')}
      />
      <input
        type="date"
        value={dateTo}
        onChange={handleChange(onDateToChange)}
        className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
        aria-label={localize('com_ui_admin_date_to')}
      />
    </div>
  );
}

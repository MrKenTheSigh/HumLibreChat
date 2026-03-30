import { useState } from 'react';
import { useLocalize } from '~/hooks';
import {
  useAddAdminUserBalanceMutation,
  useSetAdminUserBalanceMutation,
} from '~/data-provider/Admin';

export default function AdminUserBalanceCard({
  userId,
  tokenCredits,
}: {
  userId: string;
  tokenCredits: number;
}) {
  const localize = useLocalize();
  const [addAmount, setAddAmount] = useState('');
  const addMutation = useAddAdminUserBalanceMutation();
  const setMutation = useSetAdminUserBalanceMutation();
  const parsedAddAmount = Number(addAmount);
  const hasPendingAdd =
    addAmount.trim().length > 0 && Number.isFinite(parsedAddAmount) && parsedAddAmount > 0;
  const nextTokenCredits = hasPendingAdd ? tokenCredits + parsedAddAmount : tokenCredits;

  const errorMessage =
    addMutation.error?.response?.data?.message ??
    addMutation.error?.message ??
    setMutation.error?.response?.data?.message ??
    setMutation.error?.message;

  return (
    <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-text-primary">
          {localize('com_ui_admin_balance_title')}
        </h2>
        <p className="mt-1 text-2xl font-semibold text-text-primary">
          {new Intl.NumberFormat().format(Math.round(tokenCredits))}
          {hasPendingAdd && (
            <span className="text-text-secondary">
              {' > '}
              {new Intl.NumberFormat().format(Math.round(nextTokenCredits))}
            </span>
          )}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-text-secondary" htmlFor="admin-balance-add">
          {localize('com_ui_add')}
        </label>
        <input
          id="admin-balance-add"
          type="number"
          min="1"
          value={addAmount}
          onChange={(event) => setAddAmount(event.target.value)}
          className="w-full rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={addMutation.isLoading || setMutation.isLoading || hasPendingAdd !== true}
          className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            addMutation.mutate(
              { userId, amount: parsedAddAmount },
              {
                onSuccess: () => {
                  setAddAmount('');
                },
              },
            );
          }}
        >
          {localize('com_ui_add')}
        </button>

        <button
          type="button"
          disabled={setMutation.isLoading || addMutation.isLoading || tokenCredits === 0}
          className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            setMutation.mutate({ userId, amount: 0 });
          }}
        >
          {localize('com_ui_clear')}
        </button>
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      )}
    </section>
  );
}

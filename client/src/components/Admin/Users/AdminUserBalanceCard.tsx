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
  const [setAmount, setSetAmount] = useState('');
  const addMutation = useAddAdminUserBalanceMutation();
  const setMutation = useSetAdminUserBalanceMutation();

  const errorMessage =
    addMutation.error?.response?.data?.message ??
    addMutation.error?.message ??
    setMutation.error?.response?.data?.message ??
    setMutation.error?.message;

  return (
    <section className="rounded-2xl border border-border-medium bg-surface-primary p-4">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-text-primary">{localize('com_nav_balance')}</h2>
        <p className="mt-1 text-2xl font-semibold text-text-primary">
          {new Intl.NumberFormat().format(Math.round(tokenCredits))}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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
          <button
            type="button"
            disabled={addMutation.isLoading || addAmount.trim().length === 0}
            className="rounded-xl bg-surface-hover px-4 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              const amount = Number(addAmount);
              addMutation.mutate(
                { userId, amount },
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
        </div>

        <div className="space-y-2">
          <label className="text-sm text-text-secondary" htmlFor="admin-balance-set">
            {localize('com_ui_set')}
          </label>
          <input
            id="admin-balance-set"
            type="number"
            min="0"
            value={setAmount}
            onChange={(event) => setSetAmount(event.target.value)}
            className="w-full rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
          />
          <button
            type="button"
            disabled={setMutation.isLoading || setAmount.trim().length === 0}
            className="rounded-xl bg-surface-hover px-4 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              const amount = Number(setAmount);
              setMutation.mutate(
                { userId, amount },
                {
                  onSuccess: () => {
                    setSetAmount('');
                  },
                },
              );
            }}
          >
            {localize('com_ui_set')}
          </button>
        </div>
      </div>

      {errorMessage && <p className="mt-3 text-sm text-red-500">{errorMessage}</p>}
    </section>
  );
}

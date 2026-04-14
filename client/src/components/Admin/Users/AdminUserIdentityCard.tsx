import { useEffect, useState } from 'react';
import { useLocalize } from '~/hooks';
import { useUpdateAdminUserMutation } from '~/data-provider/Admin';

type AdminUserIdentityCardProps = {
  userId: string;
  name: string | null;
  username: string | null;
  email: string;
};

export default function AdminUserIdentityCard(props: AdminUserIdentityCardProps) {
  const { userId, name, username, email } = props;
  const localize = useLocalize();
  const updateUserMutation = useUpdateAdminUserMutation();
  const [nextName, setNextName] = useState(name ?? '');

  useEffect(() => {
    setNextName(name ?? '');
  }, [name]);

  const trimmedName = nextName.trim();
  const isDirty = trimmedName !== (name ?? '');
  const canSave = trimmedName.length >= 3 && trimmedName.length <= 80 && isDirty;
  const errorMessage =
    updateUserMutation.error?.response?.data?.message ?? updateUserMutation.error?.message;

  return (
    <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-text-primary">
          {localize('com_ui_admin_user_identity_title')}
        </h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          {localize('com_ui_admin_user_identity_description')}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border-medium bg-background p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_auth_email')}
            </div>
            <div className="mt-2 text-sm text-text-primary">{email}</div>
          </div>
          <div className="rounded-2xl border border-border-medium bg-background p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_auth_username')}
            </div>
            <div className="mt-2 text-sm text-text-primary">
              {username && username.length > 0 ? username : localize('com_ui_none')}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border-medium bg-background p-4">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_name')}
              <input
                value={nextName}
                onChange={(event) => setNextName(event.target.value)}
                className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
              />
            </label>
            <button
              type="button"
              disabled={updateUserMutation.isLoading || !canSave}
              onClick={() => updateUserMutation.mutate({ userId, name: trimmedName })}
              className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {localize('com_ui_save')}
            </button>
          </div>
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

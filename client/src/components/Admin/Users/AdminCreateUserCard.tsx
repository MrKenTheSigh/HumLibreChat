import { useState } from 'react';
import type { TError } from 'librechat-data-provider';
import { useCreateAdminUserMutation } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';

type CreateUserForm = {
  name: string;
  username: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'USER';
  emailVerified: boolean;
};

const emptyForm: CreateUserForm = {
  name: '',
  username: '',
  email: '',
  password: '',
  role: 'USER',
  emailVerified: true,
};

function toErrorMessage(error: TError | undefined): string | null {
  return error?.response?.data?.message ?? error?.message ?? null;
}

export default function AdminCreateUserCard(props: {
  onCreated: (userId: string) => void;
  onCancel: () => void;
}) {
  const { onCreated, onCancel } = props;
  const localize = useLocalize();
  const [form, setForm] = useState<CreateUserForm>(emptyForm);
  const createMutation = useCreateAdminUserMutation();
  const errorMessage = toErrorMessage(createMutation.error);

  return (
    <section className="rounded-2xl border border-border-medium bg-surface-primary p-4">
      <div className="mb-4">
        <h2 className="text-base font-medium text-text-primary">
          {localize('com_ui_admin_create_user')}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {localize('com_ui_admin_create_user_description')}
        </p>
      </div>

      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate(
            {
              name: form.name.trim(),
              username: form.username.trim() || null,
              email: form.email.trim(),
              password: form.password,
              role: form.role,
              emailVerified: form.emailVerified,
            },
            {
              onSuccess: (user) => {
                setForm(emptyForm);
                onCreated(user.id);
              },
            },
          );
        }}
      >
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
            {localize('com_auth_username')}
            <input
              value={form.username}
              onChange={(event) =>
                setForm((current) => ({ ...current, username: event.target.value }))
              }
              className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-text-secondary">
            {localize('com_auth_email')}
            <input
              required={true}
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-text-secondary">
            {localize('com_auth_password')}
            <input
              required={true}
              type="password"
              minLength={8}
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
            />
            <span className="text-xs text-text-secondary">
              {localize('com_auth_password_min_length')}
            </span>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-text-secondary">
            {localize('com_ui_role')}
            <select
              value={form.role}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  role: event.target.value as CreateUserForm['role'],
                }))
              }
              className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-border-medium bg-background px-4 py-3 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={form.emailVerified}
              onChange={(event) =>
                setForm((current) => ({ ...current, emailVerified: event.target.checked }))
              }
            />
            <span>{localize('com_ui_admin_email_verified')}</span>
          </label>
        </div>

        {errorMessage && (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={createMutation.isLoading}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {localize('com_ui_create')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={createMutation.isLoading}
            className="rounded-xl border border-border-medium px-4 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {localize('com_ui_cancel')}
          </button>
        </div>
      </form>
    </section>
  );
}

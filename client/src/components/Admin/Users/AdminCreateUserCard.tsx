import { useEffect, useState } from 'react';
import type { TError } from 'librechat-data-provider';
import { SystemRoles } from 'librechat-data-provider';
import { useCreateAdminUserMutation, useGetAdminRolesQuery } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';

type CreateUserForm = {
  name: string;
  email: string;
  password: string;
  role: string;
  emailVerified: boolean;
};

const emptyForm: CreateUserForm = {
  name: '',
  email: '',
  password: '',
  role: SystemRoles.USER,
  emailVerified: true,
};

function toErrorMessage(error: TError | null | undefined): string | null {
  return error?.response?.data?.message ?? error?.message ?? null;
}

export default function AdminCreateUserCard(props: {
  onCreated: (userId: string) => void;
  onCancel: () => void;
}) {
  const { onCreated, onCancel } = props;
  const localize = useLocalize();
  const [form, setForm] = useState<CreateUserForm>(emptyForm);
  const rolesQuery = useGetAdminRolesQuery();
  const createMutation = useCreateAdminUserMutation();
  const errorMessage = toErrorMessage(createMutation.error);
  const availableRoles = rolesQuery.data?.roles ?? [];

  useEffect(() => {
    if (availableRoles.length === 0 || availableRoles.some((role) => role.name === form.role)) {
      return;
    }

    const nextRole =
      availableRoles.find((role) => role.name === SystemRoles.USER)?.name ?? availableRoles[0].name;
    setForm((current) => ({ ...current, role: nextRole }));
  }, [availableRoles, form.role]);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        createMutation.mutate(
          {
            name: form.name.trim(),
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
      <h2 className="text-base font-medium text-text-primary">
        {localize('com_ui_admin_create_user')}
      </h2>

      <section className="rounded-2xl border border-border-medium bg-surface-primary p-4">
        <label className="flex flex-col gap-2 text-sm text-text-secondary">
          {localize('com_ui_name')}
          <input
            required={true}
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
          />
        </label>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
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
            <span className="flex items-center justify-between gap-3">
              <span>{localize('com_auth_password')}</span>
              <span className="text-[11px] font-normal tracking-[0.02em] text-text-tertiary">
                {localize('com_auth_password_min_length')}
              </span>
            </span>
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
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
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
              {availableRoles.length === 0 && <option value={form.role}>{form.role}</option>}
              {availableRoles.map((role) => (
                <option key={role.name} value={role.name}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-text-secondary">
            {localize('com_ui_admin_email_verified')}
            <span className="flex h-[42px] items-center gap-3 rounded-xl border border-border-medium bg-background px-4 py-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={form.emailVerified}
                onChange={(event) =>
                  setForm((current) => ({ ...current, emailVerified: event.target.checked }))
                }
              />
              <span>{localize('com_ui_yes')}</span>
            </span>
          </label>
        </div>

        {errorMessage && (
          <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={createMutation.isLoading}
          className="admin-button-primary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {localize('com_ui_create')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={createMutation.isLoading}
          className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {localize('com_ui_cancel')}
        </button>
      </div>
    </form>
  );
}

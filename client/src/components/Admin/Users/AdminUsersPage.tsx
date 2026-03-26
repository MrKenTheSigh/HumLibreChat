import { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { useGetAdminUsersQuery } from '~/data-provider/Admin';
import AdminLayout from '../AdminLayout';
import AdminCreateUserCard from './AdminCreateUserCard';

const providerOptions = [
  'all',
  'local',
  'google',
  'openid',
  'ldap',
  'github',
  'discord',
  'facebook',
];
const roleOptions = ['all', 'ADMIN', 'USER'];

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [provider, setProvider] = useState('all');
  const [emailVerified, setEmailVerified] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
  }, [deferredSearch, role, provider, emailVerified]);

  const usersQuery = useGetAdminUsersQuery({
    cursor,
    search: deferredSearch || undefined,
    role: role === 'all' ? undefined : role,
    provider: provider === 'all' ? undefined : provider,
    emailVerified: emailVerified === '' ? undefined : emailVerified === 'true',
  });

  const users = usersQuery.data?.users ?? [];

  return (
    <AdminLayout
      title={localize('com_ui_admin_users')}
      description={localize('com_ui_admin_users_description')}
    >
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowCreateForm((current) => !current)}
            className="rounded-xl border border-border-medium px-4 py-2 text-sm text-text-primary"
          >
            {showCreateForm
              ? localize('com_ui_admin_hide_create_user')
              : localize('com_ui_admin_create_user')}
          </button>
        </div>

        {showCreateForm && (
          <AdminCreateUserCard
            onCreated={(userId) => {
              setShowCreateForm(false);
              navigate(`/d/admin/users/${userId}`);
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={localize('com_ui_admin_search_users_placeholder')}
            className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary md:col-span-2"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
            aria-label={localize('com_ui_role')}
          >
            {roleOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? localize('com_ui_all_proper') : option}
              </option>
            ))}
          </select>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
            aria-label={localize('com_ui_provider')}
          >
            {providerOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? localize('com_ui_all_proper') : option}
              </option>
            ))}
          </select>
          <select
            value={emailVerified}
            onChange={(event) => setEmailVerified(event.target.value)}
            className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
            aria-label={localize('com_ui_admin_email_verified')}
          >
            <option value="">{localize('com_ui_all_proper')}</option>
            <option value="true">{localize('com_ui_yes')}</option>
            <option value="false">{localize('com_ui_no')}</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-medium bg-surface-primary">
          {usersQuery.isLoading ? (
            <div className="p-6 text-sm text-text-secondary">{localize('com_ui_loading')}</div>
          ) : users.length === 0 ? (
            <div className="p-6 text-sm text-text-secondary">
              {localize('com_ui_admin_empty_users')}
            </div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border-medium text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_user')}</th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_role')}</th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_provider')}</th>
                  <th className="px-4 py-3 font-medium">
                    {localize('com_ui_admin_email_verified')}
                  </th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_admin_two_factor')}</th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_admin_updated_at')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="cursor-pointer border-b border-border-light transition-colors hover:bg-surface-hover"
                    onClick={() => navigate(`/d/admin/users/${user.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">
                        {user.name || user.username || localize('com_ui_unknown')}
                      </div>
                      <div className="text-xs text-text-secondary">{user.email}</div>
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {user.role ?? localize('com_ui_unknown')}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{user.provider}</td>
                    <td className="px-4 py-3 text-text-primary">
                      {user.emailVerified ? localize('com_ui_yes') : localize('com_ui_no')}
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {user.twoFactorEnabled ? localize('com_ui_yes') : localize('com_ui_no')}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{user.updatedAt ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={cursorHistory.length === 0}
            className="rounded-xl border border-border-medium px-4 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              const nextHistory = [...cursorHistory];
              const previousCursor = nextHistory.pop();
              setCursorHistory(nextHistory);
              setCursor(previousCursor || undefined);
            }}
          >
            {localize('com_ui_back')}
          </button>
          <button
            type="button"
            disabled={!usersQuery.data?.nextCursor}
            className="rounded-xl border border-border-medium px-4 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              if (!usersQuery.data?.nextCursor) {
                return;
              }

              setCursorHistory((current) => [...current, cursor ?? '']);
              setCursor(usersQuery.data.nextCursor);
            }}
          >
            {localize('com_ui_admin_next_page')}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}

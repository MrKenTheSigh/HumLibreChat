import { useNavigate } from 'react-router-dom';
import { useGetAdminChannelsQuery } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminLayout from '../AdminLayout';

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={
        active
          ? 'inline-flex rounded-full bg-surface-hover px-2 py-1 text-xs font-medium text-text-primary'
          : 'inline-flex rounded-full bg-background px-2 py-1 text-xs font-medium text-text-secondary'
      }
    >
      {label}
    </span>
  );
}

export default function AdminChannelsPage() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const channelsQuery = useGetAdminChannelsQuery();
  const channels = channelsQuery.data?.channels ?? [];

  return (
    <AdminLayout
      title={localize('com_ui_admin_channels')}
      description={localize('com_ui_admin_channels_description')}
    >
      <div className="flex h-full flex-col gap-4">
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-xl bg-surface-hover px-4 py-2 text-sm font-medium text-text-primary"
            onClick={() => navigate('/d/admin/channels/new')}
          >
            {localize('com_ui_create')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-medium bg-surface-primary">
          {channelsQuery.isLoading ? (
            <div className="p-6 text-sm text-text-secondary">{localize('com_ui_loading')}</div>
          ) : channels.length === 0 ? (
            <div className="p-6 text-sm text-text-secondary">
              {localize('com_ui_admin_empty_channels')}
            </div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border-medium text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_name')}</th>
                  <th className="px-4 py-3 font-medium">
                    {localize('com_ui_admin_channel_status')}
                  </th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_admin_sort_order')}</th>
                  <th className="px-4 py-3 font-medium">
                    {localize('com_ui_admin_channel_entries')}
                  </th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_admin_updated_at')}</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => (
                  <tr
                    key={channel.id}
                    className="cursor-pointer border-b border-border-light transition-colors hover:bg-surface-hover"
                    onClick={() => navigate(`/d/admin/channels/${channel.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{channel.name}</div>
                      <div className="text-xs text-text-secondary">{channel.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        active={channel.enabled}
                        label={
                          channel.enabled
                            ? localize('com_ui_admin_enabled')
                            : localize('com_ui_admin_disabled')
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-text-primary">{channel.sortOrder}</td>
                    <td className="px-4 py-3 text-text-primary">{channel.entries.length}</td>
                    <td className="px-4 py-3 text-text-primary">{channel.updatedAt ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

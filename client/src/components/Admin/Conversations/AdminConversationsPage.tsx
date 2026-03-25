import { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { useGetAdminConversationsQuery } from '~/data-provider/Admin';
import AdminLayout from '../AdminLayout';

export default function AdminConversationsPage() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
  }, [deferredSearch, userId, endpoint, model]);

  const conversationsQuery = useGetAdminConversationsQuery({
    cursor,
    search: deferredSearch || undefined,
    userId: userId.trim() || undefined,
    endpoint: endpoint.trim() || undefined,
    model: model.trim() || undefined,
  });

  const conversations = conversationsQuery.data?.conversations ?? [];

  return (
    <AdminLayout
      title={localize('com_ui_admin_conversations')}
      description={localize('com_ui_admin_conversations_description')}
    >
      <div className="flex h-full flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={localize('com_ui_admin_search_conversations_placeholder')}
            className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary md:col-span-2"
          />
          <input
            type="text"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder={localize('com_ui_admin_user_id_placeholder')}
            className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
          />
          <input
            type="text"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder={localize('com_ui_provider')}
            className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
          />
          <input
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={localize('com_ui_model')}
            className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-medium bg-surface-primary">
          {conversationsQuery.isLoading ? (
            <div className="p-6 text-sm text-text-secondary">{localize('com_ui_loading')}</div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-sm text-text-secondary">
              {localize('com_ui_admin_empty_conversations')}
            </div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border-medium text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_conversations')}</th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_user')}</th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_provider')}</th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_model')}</th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_admin_updated_at')}</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((conversation) => (
                  <tr
                    key={conversation.conversationId}
                    className="cursor-pointer border-b border-border-light transition-colors hover:bg-surface-hover"
                    onClick={() => navigate(`/d/admin/conversations/${conversation.conversationId}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">
                        {conversation.title || localize('com_ui_unknown')}
                      </div>
                      <div className="text-xs text-text-secondary">{conversation.conversationId}</div>
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {conversation.userEmail || conversation.userId || localize('com_ui_unknown')}
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {conversation.endpoint || localize('com_ui_unknown')}
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {conversation.model || localize('com_ui_unknown')}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{conversation.updatedAt ?? '-'}</td>
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
            disabled={!conversationsQuery.data?.nextCursor}
            className="rounded-xl border border-border-medium px-4 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              if (!conversationsQuery.data?.nextCursor) {
                return;
              }

              setCursorHistory((current) => [...current, cursor ?? '']);
              setCursor(conversationsQuery.data.nextCursor);
            }}
          >
            {localize('com_ui_admin_next_page')}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}

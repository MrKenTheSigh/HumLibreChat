import { useDeferredValue, useEffect, useState } from 'react';
import { MessagesSquare, Search } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { useGetAdminConversationsQuery } from '~/data-provider/Admin';
import AdminHelpButton from '../AdminHelpButton';
import AdminLayout from '../AdminLayout';
import formatAdminDateTime from '../formatAdminDateTime';

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
  const currentPage = cursorHistory.length + 1;

  return (
    <AdminLayout title={localize('com_ui_admin_conversations')} hideHeader={true}>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <section className="shrink-0 rounded-3xl border border-border-medium bg-surface-primary p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                  <MessagesSquare className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-medium text-text-primary">
                    {localize('com_ui_admin_conversations')}
                  </h1>
                  <AdminHelpButton
                    title="com_ui_admin_conversations"
                    description="com_ui_admin_conversations_description"
                  />
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border-light bg-background px-3 py-1.5 text-xs font-medium text-text-secondary">
                {localize('com_ui_results_found', { count: conversations.length })}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_search')}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={localize('com_ui_admin_search_conversations_placeholder')}
                    className="w-full rounded-xl border border-border-medium bg-background py-2 pl-9 pr-3 text-sm text-text-primary"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_user')}
                <input
                  type="text"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  placeholder={localize('com_ui_admin_user_id_placeholder')}
                  className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_provider')}
                <input
                  type="text"
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                  placeholder={localize('com_ui_provider')}
                  className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_model')}
                <input
                  type="text"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder={localize('com_ui_model')}
                  className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary">
          <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-text-primary">
                {localize('com_ui_admin_conversations')}
              </h2>
              <div className="text-sm text-text-secondary">{conversations.length}</div>
            </div>

            {conversationsQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : conversations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_admin_empty_conversations')}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.conversationId}
                    type="button"
                    className="grid gap-4 rounded-2xl border border-border-medium bg-background p-4 text-left transition-colors hover:bg-surface-hover"
                    onClick={() =>
                      navigate(`/d/admin/conversations/${conversation.conversationId}`)
                    }
                  >
                    <div>
                      <div className="text-base font-medium text-text-primary">
                        {conversation.title || localize('com_ui_unknown')}
                      </div>
                      <div className="text-sm text-text-secondary">
                        {conversation.conversationId}
                      </div>
                    </div>

                    <div className="grid gap-3 text-sm md:grid-cols-4">
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_user')}
                        </div>
                        <div className="mt-1 text-text-primary">
                          {conversation.userEmail ||
                            conversation.userId ||
                            localize('com_ui_unknown')}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_provider')}
                        </div>
                        <div className="mt-1 text-text-primary">
                          {conversation.endpoint || localize('com_ui_unknown')}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_model')}
                        </div>
                        <div className="mt-1 text-text-primary">
                          {conversation.model || localize('com_ui_unknown')}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-text-secondary">
                          {localize('com_ui_admin_updated_at')}
                        </div>
                        <div className="mt-1 text-text-primary">
                          {formatAdminDateTime(conversation.updatedAt)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light px-5 py-4">
            <div className="text-sm text-text-secondary">
              {localize('com_ui_page')} {currentPage}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={cursorHistory.length === 0}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
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
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
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
        </section>
        <Outlet />
      </div>
    </AdminLayout>
  );
}

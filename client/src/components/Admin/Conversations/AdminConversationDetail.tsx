import { Link, useParams } from 'react-router-dom';
import { useGetAdminConversationMessagesQuery } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminLayout from '../AdminLayout';

export default function AdminConversationDetail() {
  const localize = useLocalize();
  const { conversationId = '' } = useParams();
  const conversationQuery = useGetAdminConversationMessagesQuery(conversationId, {
    enabled: conversationId.length > 0,
  });

  if (conversationQuery.isLoading) {
    return (
      <AdminLayout
        title={localize('com_ui_admin_conversation_details')}
        description={localize('com_ui_admin_conversation_details_description')}
      >
        <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>
      </AdminLayout>
    );
  }

  if (!conversationQuery.data) {
    return (
      <AdminLayout
        title={localize('com_ui_admin_conversation_details')}
        description={localize('com_ui_admin_conversation_details_description')}
      >
        <div className="space-y-4">
          <Link className="text-sm text-text-secondary underline" to="/d/admin/conversations">
            {localize('com_ui_back')}
          </Link>
          <p className="text-sm text-text-secondary">{localize('com_ui_no_results_found')}</p>
        </div>
      </AdminLayout>
    );
  }

  const { conversation, messages } = conversationQuery.data;

  return (
    <AdminLayout
      title={localize('com_ui_admin_conversation_details')}
      description={localize('com_ui_admin_conversation_details_description')}
    >
      <div className="flex h-full flex-col gap-6">
        <div>
          <Link className="text-sm text-text-secondary underline" to="/d/admin/conversations">
            {localize('com_ui_back')}
          </Link>
        </div>

        <section className="grid gap-4 rounded-2xl border border-border-medium bg-surface-primary p-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_ui_conversations')}
            </div>
            <div className="mt-1 text-sm text-text-primary">
              {conversation.title || localize('com_ui_unknown')}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_ui_user')}
            </div>
            <div className="mt-1 text-sm text-text-primary">
              {conversation.userEmail || conversation.userId || localize('com_ui_unknown')}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_ui_provider')}
            </div>
            <div className="mt-1 text-sm text-text-primary">
              {conversation.endpoint || localize('com_ui_unknown')}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-text-secondary">
              {localize('com_ui_model')}
            </div>
            <div className="mt-1 text-sm text-text-primary">
              {conversation.model || localize('com_ui_unknown')}
            </div>
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-medium bg-surface-primary p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <article
                key={message.messageId}
                className={
                  message.isCreatedByUser
                    ? 'rounded-2xl border border-border-medium bg-background p-4'
                    : 'rounded-2xl border border-border-medium bg-surface-hover p-4'
                }
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-wide text-text-secondary">
                    {message.isCreatedByUser
                      ? localize('com_ui_user')
                      : localize('com_ui_assistant')}
                  </span>
                  <span className="text-xs text-text-secondary">{message.createdAt ?? '-'}</span>
                </div>
                <div className="whitespace-pre-wrap break-words text-sm text-text-primary">
                  {message.text || JSON.stringify(message.content, null, 2)}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

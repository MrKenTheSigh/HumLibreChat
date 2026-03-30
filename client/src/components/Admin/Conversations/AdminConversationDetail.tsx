import { MessageSquareQuote, MessagesSquare } from 'lucide-react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogOverlay,
  OGDialogPortal,
  OGDialogTitle,
} from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import { useGetAdminConversationMessagesQuery } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import formatAdminDateTime from '../formatAdminDateTime';

export default function AdminConversationDetail() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { conversationId = '' } = useParams();
  const conversationQuery = useGetAdminConversationMessagesQuery(conversationId, {
    enabled: conversationId.length > 0,
  });
  const closeModal = () => navigate('/d/admin/conversations');

  if (conversationQuery.isLoading) {
    return (
      <OGDialog open={true} onOpenChange={(open) => !open && closeModal()}>
        <OGDialogPortal>
          <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
          <OGDialogContent
            className="admin-console fixed left-1/2 top-1/2 z-50 w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border-medium bg-surface-primary p-6 shadow-2xl focus:outline-none"
            showCloseButton={true}
          >
            <OGDialogTitle className="text-lg font-semibold text-text-primary">
              {localize('com_ui_admin_conversation_details')}
            </OGDialogTitle>
            <div className="mt-4 rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
              {localize('com_ui_loading')}
            </div>
          </OGDialogContent>
        </OGDialogPortal>
      </OGDialog>
    );
  }

  if (!conversationQuery.data) {
    return (
      <OGDialog open={true} onOpenChange={(open) => !open && closeModal()}>
        <OGDialogPortal>
          <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
          <OGDialogContent
            className="admin-console fixed left-1/2 top-1/2 z-50 w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border-medium bg-surface-primary p-6 shadow-2xl focus:outline-none"
            showCloseButton={true}
          >
            <OGDialogTitle className="text-lg font-semibold text-text-primary">
              {localize('com_ui_admin_conversation_details')}
            </OGDialogTitle>
            <p className="mt-4 text-sm text-text-secondary">
              {localize('com_ui_no_results_found')}
            </p>
          </OGDialogContent>
        </OGDialogPortal>
      </OGDialog>
    );
  }

  const { conversation, messages } = conversationQuery.data;

  return (
    <OGDialog open={true} onOpenChange={(open) => !open && closeModal()}>
      <OGDialogPortal>
        <OGDialogOverlay className="bg-black/55 backdrop-blur-sm" />
        <OGDialogContent
          className="admin-console fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(1120px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary p-0 shadow-2xl focus:outline-none"
          showCloseButton={true}
        >
          <OGDialogTitle className="sr-only">
            {localize('com_ui_admin_conversation_details')}
          </OGDialogTitle>
          <div className="shrink-0 border-b border-border-light px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background text-text-primary">
                <MessagesSquare className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-text-primary">
                  {conversation.title || localize('com_ui_unknown')}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">{conversation.conversationId}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              <div className="rounded-2xl border border-border-medium bg-background p-4">
                <div className="text-xs uppercase tracking-wide text-text-secondary">
                  {localize('com_ui_user')}
                </div>
                <div className="mt-2 text-sm text-text-primary">
                  {conversation.userEmail || conversation.userId || localize('com_ui_unknown')}
                </div>
              </div>
              <div className="rounded-2xl border border-border-medium bg-background p-4">
                <div className="text-xs uppercase tracking-wide text-text-secondary">
                  {localize('com_ui_provider')}
                </div>
                <div className="mt-2 text-sm text-text-primary">
                  {conversation.endpoint || localize('com_ui_unknown')}
                </div>
              </div>
              <div className="rounded-2xl border border-border-medium bg-background p-4">
                <div className="text-xs uppercase tracking-wide text-text-secondary">
                  {localize('com_ui_model')}
                </div>
                <div className="mt-2 text-sm text-text-primary">
                  {conversation.model || localize('com_ui_unknown')}
                </div>
              </div>
              <div className="rounded-2xl border border-border-medium bg-background p-4">
                <div className="text-xs uppercase tracking-wide text-text-secondary">
                  {localize('com_ui_admin_updated_at')}
                </div>
                <div className="mt-2 text-sm text-text-primary">
                  {formatAdminDateTime(conversation.updatedAt)}
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="mb-4 flex items-center gap-3">
              <MessageSquareQuote className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              <h2 className="text-sm font-medium text-text-primary">
                {localize('com_ui_admin_conversation_messages_title')}
              </h2>
            </div>
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
                    <span className="text-xs text-text-secondary">
                      {formatAdminDateTime(message.createdAt)}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm text-text-primary">
                    {message.text || JSON.stringify(message.content, null, 2)}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </OGDialogContent>
      </OGDialogPortal>
    </OGDialog>
  );
}

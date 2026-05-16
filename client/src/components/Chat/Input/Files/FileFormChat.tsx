import { memo, useEffect, useMemo, useState } from 'react';
import { SSE } from 'sse.js';
import { LoaderCircle } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { apiBaseUrl, request } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useFileHandling } from '~/hooks';
import { useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';
import FileRow from './FileRow';
import store from '~/store';
import {
  FILE_PROCESSING_STARTED_EVENT,
  FILE_UPLOAD_DELAYED_EVENT,
} from '~/hooks/Files/useDelayedUploadToast';

type FileProcessingEvent = {
  file_id?: string;
  filename?: string;
  status?: string;
  messageKey?: TranslationKeys;
};

type ProcessingNotice = {
  file_id: string;
  filename?: string;
  messageKey?: TranslationKeys;
};

function FileFormChat({ conversation }: { conversation: TConversation | null }) {
  const { files, setFiles, setFilesLoading } = useChatContext();
  const localize = useLocalize();
  const { token, isAuthenticated } = useAuthContext();
  const [processingNotices, setProcessingNotices] = useState<Map<string, ProcessingNotice>>(
    () => new Map(),
  );
  const chatDirection = useRecoilValue(store.chatDirection).toLowerCase();
  const { endpoint: _endpoint } = conversation ?? { endpoint: null };
  const { abortUpload } = useFileHandling();

  const isRTL = chatDirection === 'rtl';
  useEffect(() => {
    if (!isAuthenticated || !token) {
      return;
    }

    const sse = new SSE(`${apiBaseUrl()}/api/files/events`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    sse.addEventListener('file_processing_status', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as FileProcessingEvent;
        if (data.status !== 'vision_ocr_processing' || !data.file_id) {
          return;
        }
        const fileId = data.file_id;
        window.dispatchEvent(
          new CustomEvent(FILE_PROCESSING_STARTED_EVENT, { detail: { file_id: fileId } }),
        );

        setProcessingNotices((current) => {
          const next = new Map(current);
          next.set(fileId, {
            file_id: fileId,
            filename: data.filename,
            messageKey: data.messageKey ?? 'com_ui_upload_pdf_vision_ocr_processing',
          });
          return next;
        });
      } catch (error) {
        console.error('Failed to parse file processing event', error);
      }
    });

    sse.addEventListener('error', async (event: MessageEvent & { responseCode?: number }) => {
      if (event.responseCode !== 401) {
        return;
      }

      try {
        const refreshResponse = await request.refreshToken();
        const nextToken = refreshResponse?.token ?? '';
        if (!nextToken) {
          return;
        }
        sse.headers = { Authorization: `Bearer ${nextToken}` };
        request.dispatchTokenUpdatedEvent(nextToken);
        sse.stream();
      } catch (error) {
        console.error('Failed to refresh token for file events stream', error);
      }
    });

    sse.stream();

    return () => {
      sse.close();
    };
  }, [isAuthenticated, token]);

  useEffect(() => {
    const handleFileUploadDelayed = (event: Event) => {
      const customEvent = event as CustomEvent<{
        file_id?: string;
        filename?: string;
        messageKey?: TranslationKeys;
      }>;
      const fileId = customEvent.detail?.file_id;
      if (!fileId) {
        return;
      }

      customEvent.preventDefault();
      setProcessingNotices((current) => {
        const next = new Map(current);
        next.set(fileId, {
          file_id: fileId,
          filename: customEvent.detail?.filename,
          messageKey: customEvent.detail?.messageKey ?? 'com_ui_upload_delay',
        });
        return next;
      });
    };

    window.addEventListener(FILE_UPLOAD_DELAYED_EVENT, handleFileUploadDelayed);
    return () => {
      window.removeEventListener(FILE_UPLOAD_DELAYED_EVENT, handleFileUploadDelayed);
    };
  }, []);

  useEffect(() => {
    if (processingNotices.size === 0) {
      return;
    }

    setProcessingNotices((current) => {
      const next = new Map(current);
      for (const fileId of current.keys()) {
        const file = files?.get(fileId);
        if (!file || file.progress >= 1) {
          next.delete(fileId);
        }
      }
      return next.size === current.size ? current : next;
    });
  }, [files, processingNotices.size]);

  const processingMessages = useMemo(() => {
    const messages = Array.from(processingNotices.values()).map((notice) => {
      const file = files?.get(notice.file_id);
      return localize(notice.messageKey ?? 'com_ui_upload_pdf_vision_ocr_processing', {
        0: notice.filename ?? file?.filename ?? file?.file?.name ?? '',
      });
    });

    return Array.from(new Set(messages));
  }, [files, localize, processingNotices]);

  return (
    <div className="mx-2 mt-2">
      <FileRow
        files={files}
        setFiles={setFiles}
        abortUpload={abortUpload}
        setFilesLoading={setFilesLoading}
        isRTL={isRTL}
        Wrapper={({ children }) => (
          <div className="flex flex-col gap-1">
            {processingMessages.length > 0 && (
              <div className="flex w-full items-start gap-2 rounded-t-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
                <LoaderCircle
                  className="mt-0.5 h-4 w-4 shrink-0 animate-spin"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  {processingMessages.map((message) => (
                    <div key={message}>{message}</div>
                  ))}
                </div>
              </div>
            )}
            {children}
          </div>
        )}
      />
    </div>
  );
}

export default memo(FileFormChat);

import { useEffect, useRef, useState } from 'react';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';

export const FILE_PROCESSING_STARTED_EVENT = 'librechat:file-processing-started';
export const FILE_UPLOAD_DELAYED_EVENT = 'librechat:file-upload-delayed';

export const useDelayedUploadToast = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [uploadTimers, setUploadTimers] = useState<Record<string, NodeJS.Timeout>>({});
  const uploadTimersRef = useRef(uploadTimers);

  useEffect(() => {
    uploadTimersRef.current = uploadTimers;
  }, [uploadTimers]);

  const determineDelay = (fileSize: number): number => {
    const baseDelay = 5000;
    const additionalDelay = Math.floor(fileSize / 1000000) * 2000;
    return baseDelay + additionalDelay;
  };

  const startUploadTimer = (fileId: string, fileName: string, fileSize: number) => {
    const delay = determineDelay(fileSize);

    if (uploadTimers[fileId]) {
      clearTimeout(uploadTimers[fileId]);
    }

    const timer = setTimeout(() => {
      const message = localize('com_ui_upload_delay', { 0: fileName });
      const event = new CustomEvent(FILE_UPLOAD_DELAYED_EVENT, {
        cancelable: true,
        detail: {
          file_id: fileId,
          filename: fileName,
          messageKey: 'com_ui_upload_delay',
        },
      });
      window.dispatchEvent(event);

      if (!event.defaultPrevented) {
        showToast({
          message,
          status: 'warning',
          duration: 10000,
        });
      }
    }, delay);

    setUploadTimers((prev) => ({ ...prev, [fileId]: timer }));
  };

  const clearUploadTimer = (fileId: string) => {
    const timer = uploadTimersRef.current[fileId];
    if (timer) {
      clearTimeout(timer);
      setUploadTimers((prev) => {
        const { [fileId]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  useEffect(() => {
    const handleFileProcessingStarted = (event: Event) => {
      const fileId = (event as CustomEvent<{ file_id?: string }>).detail?.file_id;
      if (!fileId) {
        return;
      }
      clearUploadTimer(fileId);
    };

    window.addEventListener(FILE_PROCESSING_STARTED_EVENT, handleFileProcessingStarted);
    return () => {
      window.removeEventListener(FILE_PROCESSING_STARTED_EVENT, handleFileProcessingStarted);
    };
  }, []);

  return { startUploadTimer, clearUploadTimer };
};

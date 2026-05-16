import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ExtendedFile } from '~/common';
import FileFormChat from '../FileFormChat';
import { FILE_UPLOAD_DELAYED_EVENT } from '~/hooks/Files/useDelayedUploadToast';

const mockUseChatContext = jest.fn();
const mockUseAuthContext = jest.fn(() => ({ token: 'token-123', isAuthenticated: true }));
const mockSSEInstances: Array<{
  addEventListener: jest.Mock;
  stream: jest.Mock;
  close: jest.Mock;
  headers?: Record<string, string>;
  listeners: Record<string, (event: MessageEvent & { responseCode?: number }) => void>;
}> = [];

jest.mock('~/Providers', () => ({
  useChatContext: () => mockUseChatContext(),
}));

jest.mock('~/hooks', () => ({
  useFileHandling: jest.fn(() => ({ abortUpload: jest.fn() })),
  useLocalize: jest.fn(
    () => (key: string, options?: Record<string, string>) => `${key}:${options?.[0] ?? ''}`,
  ),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('librechat-data-provider', () => ({
  apiBaseUrl: jest.fn(() => ''),
  request: {
    refreshToken: jest.fn(),
    dispatchTokenUpdatedEvent: jest.fn(),
  },
}));

jest.mock('sse.js', () => ({
  SSE: jest.fn().mockImplementation((_url: string, options?: { headers?: Record<string, string> }) => {
    const listeners: Record<string, (event: MessageEvent & { responseCode?: number }) => void> = {};
    const instance = {
      addEventListener: jest.fn(
        (eventName: string, listener: (event: MessageEvent & { responseCode?: number }) => void) => {
          listeners[eventName] = listener;
        },
      ),
      stream: jest.fn(),
      close: jest.fn(),
      headers: options?.headers,
      listeners,
    };
    mockSSEInstances.push(instance);
    return instance;
  }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: jest.fn(() => 'ltr'),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { chatDirection: {} },
}));

jest.mock('../FileRow', () => {
  return function MockFileRow({ Wrapper }: { Wrapper?: React.FC<{ children: React.ReactNode }> }) {
    const content = <span data-testid="file-row-content">files</span>;
    return <div data-testid="file-row">{Wrapper ? <Wrapper>{content}</Wrapper> : content}</div>;
  };
});

describe('FileFormChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSSEInstances.length = 0;
    mockUseAuthContext.mockReturnValue({ token: 'token-123', isAuthenticated: true });
    mockUseChatContext.mockReturnValue({
      files: new Map(),
      setFiles: jest.fn(),
      setFilesLoading: jest.fn(),
    });
  });

  it('shows a persistent processing notice above the file row after the backend event arrives', async () => {
    const file: ExtendedFile = {
      file_id: 'file-1',
      filename: 'POC.pdf',
      progress: 0.5,
      size: 123,
      type: 'application/pdf',
    };

    mockUseChatContext.mockReturnValue({
      files: new Map([[file.file_id, file]]),
      setFiles: jest.fn(),
      setFilesLoading: jest.fn(),
    });

    render(<FileFormChat conversation={null} />);

    await act(async () => {
      mockSSEInstances[0].listeners.file_processing_status({
        data: JSON.stringify({
          file_id: 'file-1',
          filename: 'POC.pdf',
          status: 'vision_ocr_processing',
          messageKey: 'com_ui_upload_pdf_vision_ocr_processing',
        }),
      } as MessageEvent);
    });

    expect(
      screen.getByText('com_ui_upload_pdf_vision_ocr_processing:POC.pdf'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('file-row-content')).toBeInTheDocument();
  });

  it('ignores non-vision processing events', async () => {
    const file: ExtendedFile = {
      file_id: 'file-1',
      filename: 'POC.pdf',
      progress: 0.5,
      size: 123,
      type: 'application/pdf',
    };

    mockUseChatContext.mockReturnValue({
      files: new Map([[file.file_id, file]]),
      setFiles: jest.fn(),
      setFilesLoading: jest.fn(),
    });

    render(<FileFormChat conversation={null} />);

    await act(async () => {
      mockSSEInstances[0].listeners.file_processing_status({
        data: JSON.stringify({
          file_id: 'file-1',
          filename: 'POC.pdf',
          status: 'document_parser_processing',
        }),
      } as MessageEvent);
    });

    expect(screen.queryByText('com_ui_upload_pdf_vision_ocr_processing:POC.pdf')).toBeNull();
    expect(screen.getByTestId('file-row-content')).toBeInTheDocument();
  });

  it('shows delayed upload notices in the file row area instead of toast fallback', () => {
    const file: ExtendedFile = {
      file_id: 'file-1',
      filename: 'POC.pdf',
      progress: 0.5,
      size: 123,
      type: 'application/pdf',
    };

    mockUseChatContext.mockReturnValue({
      files: new Map([[file.file_id, file]]),
      setFiles: jest.fn(),
      setFilesLoading: jest.fn(),
    });

    render(<FileFormChat conversation={null} />);

    const event = new CustomEvent(FILE_UPLOAD_DELAYED_EVENT, {
      cancelable: true,
      detail: {
        file_id: 'file-1',
        filename: 'POC.pdf',
        messageKey: 'com_ui_upload_delay',
      },
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText('com_ui_upload_delay:POC.pdf')).toBeInTheDocument();
  });

  it('hides the processing notice when the file is complete', async () => {
    const file: ExtendedFile = {
      file_id: 'file-1',
      filename: 'POC.pdf',
      progress: 0.5,
      size: 123,
      type: 'application/pdf',
    };
    const completeFile = { ...file, progress: 1 };

    mockUseChatContext.mockReturnValue({
      files: new Map([[file.file_id, file]]),
      setFiles: jest.fn(),
      setFilesLoading: jest.fn(),
    });

    const { rerender } = render(<FileFormChat conversation={null} />);

    await act(async () => {
      mockSSEInstances[0].listeners.file_processing_status({
        data: JSON.stringify({
          file_id: 'file-1',
          filename: 'POC.pdf',
          status: 'vision_ocr_processing',
          messageKey: 'com_ui_upload_pdf_vision_ocr_processing',
        }),
      } as MessageEvent);
    });

    expect(
      screen.getByText('com_ui_upload_pdf_vision_ocr_processing:POC.pdf'),
    ).toBeInTheDocument();

    mockUseChatContext.mockReturnValue({
      files: new Map([[completeFile.file_id, completeFile]]),
      setFiles: jest.fn(),
      setFilesLoading: jest.fn(),
    });

    rerender(<FileFormChat conversation={{ conversationId: 'updated' } as any} />);

    await waitFor(() => {
      expect(screen.queryByText('com_ui_upload_pdf_vision_ocr_processing:POC.pdf')).toBeNull();
    });
  });
});

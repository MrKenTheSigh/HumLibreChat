import { renderHook, act } from '@testing-library/react';
import { Constants, EModelEndpoint, getEndpointFileConfig } from 'librechat-data-provider';

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = jest.fn();
  Object.defineProperty(global, 'Image', {
    writable: true,
    value: class {
      onload: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    },
  });
});

const mockShowToast = jest.fn();
const mockSetFilesLoading = jest.fn();
const mockMutate = jest.fn();
const mockStartUploadTimer = jest.fn();
const mockClearUploadTimer = jest.fn();

let mockConversation: Record<string, string | null | undefined> = {};

jest.mock('~/Providers/ChatContext', () => ({
  useChatContext: jest.fn(() => ({
    files: new Map(),
    setFiles: jest.fn(),
    setFilesLoading: mockSetFilesLoading,
    conversation: mockConversation,
  })),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: jest.fn(() => ({
    showToast: mockShowToast,
  })),
}));

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useSetRecoilState: jest.fn(() => jest.fn()),
}));

jest.mock('~/store', () => ({
  ephemeralAgentByConvoId: jest.fn(() => ({ key: 'mock' })),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({
    getQueryData: jest.fn(),
    refetchQueries: jest.fn(),
  })),
}));

jest.mock('~/data-provider', () => ({
  useGetFileConfig: jest.fn(() => ({ data: null })),
  useUploadFileMutation: jest.fn((_opts: Record<string, unknown>) => ({
    mutate: mockMutate,
  })),
}));

jest.mock('~/hooks/useLocalize', () => {
  const fn = jest.fn(() => (key: string) => key) as jest.Mock & {
    TranslationKeys: Record<string, never>;
  };
  fn.TranslationKeys = {};
  return { __esModule: true, default: fn, TranslationKeys: {} };
});

jest.mock('../useDelayedUploadToast', () => ({
  useDelayedUploadToast: jest.fn(() => ({
    startUploadTimer: mockStartUploadTimer,
    clearUploadTimer: mockClearUploadTimer,
  })),
}));

jest.mock('~/utils/heicConverter', () => ({
  processFileForUpload: jest.fn(async (file: File) => file),
}));

jest.mock('../useClientResize', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    resizeImageIfNeeded: jest.fn(async (file: File) => ({ file, resized: false })),
  })),
}));

jest.mock('../useUpdateFiles', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    addFile: jest.fn(),
    replaceFile: jest.fn(),
    updateFileById: jest.fn(),
    deleteFileById: jest.fn(),
  })),
}));

jest.mock('~/utils', () => ({
  logger: { log: jest.fn() },
  validateFiles: jest.fn(() => true),
  cachePreview: jest.fn(),
  getCachedPreview: jest.fn(() => undefined),
  removePreviewEntry: jest.fn(),
  AUTO_CONTEXT_UPLOAD_RESOURCE: '__auto_context_upload__',
  getAutoUploadToolResource: jest.fn((file: File) =>
    file.type.startsWith('image/') ? undefined : 'context',
  ),
}));

const mockValidateFiles = jest.requireMock('~/utils').validateFiles;
const mockGetAutoUploadToolResource = jest.requireMock('~/utils').getAutoUploadToolResource;

describe('useFileHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConversation = {};
  });

  const loadHook = async () => (await import('../useFileHandling')).default;

  describe('endpointOverride', () => {
    it('uses conversation endpoint when no override is provided', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'openAI',
        endpointType: 'custom',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockValidateFiles).toHaveBeenCalledTimes(1);
      const validateCall = mockValidateFiles.mock.calls[0][0];
      const configResult = getEndpointFileConfig({
        endpoint: 'openAI',
        endpointType: 'custom',
        fileConfig: null,
      });
      expect(validateCall.endpointFileConfig).toEqual(configResult);
    });

    it('uses endpointOverride for validation instead of conversation endpoint', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'openAI',
        endpointType: 'custom',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() =>
        useFileHandling({ endpointOverride: EModelEndpoint.agents }),
      );

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockValidateFiles).toHaveBeenCalledTimes(1);
      const validateCall = mockValidateFiles.mock.calls[0][0];
      const agentsConfig = getEndpointFileConfig({
        endpoint: EModelEndpoint.agents,
        endpointType: EModelEndpoint.agents,
        fileConfig: null,
      });
      expect(validateCall.endpointFileConfig).toEqual(agentsConfig);
    });

    it('falls back to conversation endpoint when endpointOverride is undefined', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'anthropic',
        endpointType: undefined,
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling({ endpointOverride: undefined }));

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockValidateFiles).toHaveBeenCalledTimes(1);
      const validateCall = mockValidateFiles.mock.calls[0][0];
      const anthropicConfig = getEndpointFileConfig({
        endpoint: 'anthropic',
        endpointType: undefined,
        fileConfig: null,
      });
      expect(validateCall.endpointFileConfig).toEqual(anthropicConfig);
    });

    it('sends correct endpoint in upload form data when override is set', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'openAI',
        endpointType: 'custom',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() =>
        useFileHandling({
          endpointOverride: EModelEndpoint.agents,
          additionalMetadata: { agent_id: 'agent-123' },
        }),
      );

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      expect(formData.get('endpoint')).toBe(EModelEndpoint.agents);
      expect(formData.get('endpointType')).toBe(EModelEndpoint.agents);
    });

    it('does not enter assistants upload path when override is agents', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'assistants',
        endpointType: 'assistants',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() =>
        useFileHandling({
          endpointOverride: EModelEndpoint.agents,
          additionalMetadata: { agent_id: 'agent-123' },
        }),
      );

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      expect(formData.get('endpoint')).toBe(EModelEndpoint.agents);
      expect(formData.get('message_file')).toBeNull();
      expect(formData.get('version')).toBeNull();
      expect(formData.get('model')).toBeNull();
      expect(formData.get('assistant_id')).toBeNull();
    });

    it('enters assistants path without override when conversation is assistants', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'assistants',
        endpointType: 'assistants',
        assistant_id: 'asst-456',
        model: 'gpt-4',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      expect(formData.get('endpoint')).toBe('assistants');
      expect(formData.get('message_file')).toBe('true');
    });

    it('falls back to "default" when no conversation endpoint and no override', async () => {
      mockConversation = {
        conversationId: Constants.NEW_CONVO as string,
        endpoint: null,
        endpointType: undefined,
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.handleFiles([textFile]);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const formData: FormData = mockMutate.mock.calls[0][0];
      expect(formData.get('endpoint')).toBe('default');
    });

    it('routes auto uploads per file type before uploading', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'ollama',
        endpointType: 'custom',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());

      const imageFile = new File(['image'], 'test.png', { type: 'image/png' });
      const pdfFile = new File(['pdf'], 'test.pdf', { type: 'application/pdf' });

      await act(async () => {
        await result.current.handleFiles([imageFile, pdfFile], '__auto_context_upload__');
      });

      expect(mockGetAutoUploadToolResource).toHaveBeenCalledWith(imageFile);
      expect(mockGetAutoUploadToolResource).toHaveBeenCalledWith(pdfFile);
      expect(mockValidateFiles).toHaveBeenCalledTimes(2);
      expect(mockMutate).toHaveBeenCalledTimes(2);

      const imageFormData: FormData = mockMutate.mock.calls[0][0];
      const pdfFormData: FormData = mockMutate.mock.calls[1][0];
      expect(imageFormData.get('tool_resource')).toBeNull();
      expect(pdfFormData.get('tool_resource')).toBe('context');
    });

    it('keeps the normal delayed upload timer for PDF uploads', async () => {
      mockConversation = {
        conversationId: 'convo-1',
        endpoint: 'ollama',
        endpointType: 'custom',
        model: 'gemma4:e4b',
      };

      const useFileHandling = await loadHook();
      const { result } = renderHook(() => useFileHandling());
      const pdfFile = new File(['pdf'], 'scanned.pdf', { type: 'application/pdf' });

      await act(async () => {
        await result.current.handleFiles([pdfFile], '__auto_context_upload__');
      });

      expect(mockStartUploadTimer).toHaveBeenCalledWith(
        expect.any(String),
        'scanned.pdf',
        pdfFile.size,
      );
    });

  });
});

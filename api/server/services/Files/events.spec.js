jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn() },
}));

const {
  addFileEventConnection,
  emitFileProcessingEvent,
  getFileEventConnectionCount,
  clearFileEventConnections,
} = require('./events');

describe('file processing events', () => {
  beforeEach(() => {
    clearFileEventConnections();
    jest.clearAllMocks();
  });

  test('writes file processing status events to connections for the same user', () => {
    const res = { write: jest.fn() };
    const removeConnection = addFileEventConnection({ userId: 'user-1', res });

    emitFileProcessingEvent({
      userId: 'user-1',
      event: {
        file_id: 'file-1',
        filename: 'scan.pdf',
        status: 'vision_ocr_processing',
        messageKey: 'com_ui_upload_pdf_vision_ocr_processing',
      },
    });

    expect(res.write).toHaveBeenCalledWith('event: file_processing_status\n');
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining('"status":"vision_ocr_processing"'),
    );
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"filename":"scan.pdf"'));

    removeConnection();
    expect(getFileEventConnectionCount('user-1')).toBe(0);
  });

  test('does not write events across users', () => {
    const res = { write: jest.fn() };
    addFileEventConnection({ userId: 'user-1', res });

    emitFileProcessingEvent({
      userId: 'user-2',
      event: { file_id: 'file-2', status: 'vision_ocr_processing' },
    });

    expect(res.write).not.toHaveBeenCalled();
  });
});

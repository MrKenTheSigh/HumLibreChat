import { detectEncryptedFileFromBuffer } from './fileDetector';

function createZipBuffer(encrypted: boolean): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.writeUInt32LE(0x04034b50, 0);
  buffer.writeUInt16LE(encrypted ? 1 : 0, 6);
  buffer.writeUInt32LE(0, 18);
  buffer.writeUInt16LE(0, 26);
  buffer.writeUInt16LE(0, 28);
  return buffer;
}

describe('detectEncryptedFileFromBuffer', () => {
  it('detects encrypted PDF files', () => {
    const result = detectEncryptedFileFromBuffer(Buffer.from('%PDF-1.7\n1 0 obj\n/Encrypt 2 0 R'), {
      filename: 'secret.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.encrypted).toBe(true);
    expect(result.totalCount).toBe(1);
    expect(result.ruleMatches).toEqual([
      expect.objectContaining({ ruleCode: 'encrypted_file', count: 1 }),
    ]);
  });

  it('detects encrypted ZIP files from the general purpose bit flag', () => {
    const result = detectEncryptedFileFromBuffer(createZipBuffer(true), {
      filename: 'secret.zip',
      mimeType: 'application/zip',
    });

    expect(result.encrypted).toBe(true);
    expect(result.fileType).toBe('zip');
  });

  it('does not flag unencrypted ZIP files', () => {
    const result = detectEncryptedFileFromBuffer(createZipBuffer(false), {
      filename: 'plain.zip',
      mimeType: 'application/zip',
    });

    expect(result.encrypted).toBe(false);
    expect(result.totalCount).toBe(0);
  });

  it('flags 7z archives as encrypted candidates', () => {
    const result = detectEncryptedFileFromBuffer(
      Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00, 0x04]),
      {
        filename: 'archive.7z',
        mimeType: 'application/x-7z-compressed',
      },
    );

    expect(result.encrypted).toBe(true);
    expect(result.fileType).toBe('seven_zip');
  });
});

import fs from 'fs';
import path from 'path';
import {
  SENSITIVE_DETECTION_VERSION,
  SENSITIVE_RULE_LABELS,
  type SensitiveFileDetectionResult,
} from './rules';

type FileDetectionInput = {
  filePath: string;
  filename?: string;
  mimeType?: string;
};

type SupportedEncryptedFileType = NonNullable<SensitiveFileDetectionResult['fileType']>;

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_GENERAL_PURPOSE_ENCRYPTED_FLAG = 0x0001;
const SEVEN_ZIP_SIGNATURE = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const OOXML_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx']);
const OLE_OFFICE_EXTENSIONS = new Set(['.doc', '.xls', '.ppt']);

function createFileDetectionResult(
  encrypted: boolean,
  fileType?: SupportedEncryptedFileType,
): SensitiveFileDetectionResult {
  return {
    encrypted,
    fileType,
    source: 'file_upload',
    evaluatedAt: new Date(),
    version: SENSITIVE_DETECTION_VERSION,
    totalCount: encrypted ? 1 : 0,
    ruleMatches: encrypted
      ? [
          {
            count: 1,
            ruleCode: 'encrypted_file',
            label: SENSITIVE_RULE_LABELS.encrypted_file,
          },
        ]
      : [],
  };
}

function includesAscii(buffer: Buffer, value: string): boolean {
  return buffer.indexOf(Buffer.from(value, 'ascii')) >= 0;
}

function getFileType(input: FileDetectionInput, buffer: Buffer): SupportedEncryptedFileType | undefined {
  const extension = path.extname(input.filename ?? input.filePath).toLowerCase();
  const mimeType = input.mimeType?.toLowerCase() ?? '';

  if (
    mimeType === 'application/pdf' ||
    extension === '.pdf' ||
    buffer.subarray(0, 5).toString() === '%PDF-'
  ) {
    return 'pdf';
  }

  if (extension === '.7z' || buffer.subarray(0, 6).equals(SEVEN_ZIP_SIGNATURE)) {
    return 'seven_zip';
  }

  if (
    extension === '.zip' ||
    OOXML_EXTENSIONS.has(extension) ||
    mimeType.includes('zip') ||
    buffer.readUInt32LE(0) === ZIP_LOCAL_FILE_HEADER
  ) {
    return OOXML_EXTENSIONS.has(extension) ? 'office' : 'zip';
  }

  if (OLE_OFFICE_EXTENSIONS.has(extension) || buffer.subarray(0, 8).equals(OLE_SIGNATURE)) {
    return 'office';
  }

  return undefined;
}

function isPdfEncrypted(buffer: Buffer): boolean {
  const content = buffer.toString('binary');
  return (
    content.includes('/Encrypt') ||
    content.includes('/Encrypt ') ||
    content.includes('/O (') ||
    content.includes('/U (')
  );
}

function isZipEncrypted(buffer: Buffer): boolean {
  let offset = 0;
  while (offset + 8 < buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== ZIP_LOCAL_FILE_HEADER) {
      offset += 1;
      continue;
    }

    const flags = buffer.readUInt16LE(offset + 6);
    if ((flags & ZIP_GENERAL_PURPOSE_ENCRYPTED_FLAG) !== 0) {
      return true;
    }

    const compressedSize = buffer.readUInt32LE(offset + 18);
    const filenameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nextOffset = offset + 30 + filenameLength + extraLength + compressedSize;
    if (nextOffset <= offset) {
      return false;
    }
    offset = nextOffset;
  }

  return false;
}

function isSevenZipEncrypted(buffer: Buffer): boolean {
  return buffer.subarray(0, 6).equals(SEVEN_ZIP_SIGNATURE);
}

function isOfficeEncrypted(buffer: Buffer, input: FileDetectionInput): boolean {
  const extension = path.extname(input.filename ?? input.filePath).toLowerCase();

  if (OOXML_EXTENSIONS.has(extension)) {
    return isZipEncrypted(buffer);
  }

  if (!buffer.subarray(0, 8).equals(OLE_SIGNATURE)) {
    return false;
  }

  return (
    includesAscii(buffer, 'EncryptedPackage') ||
    includesAscii(buffer, 'EncryptionInfo') ||
    includesAscii(buffer, 'StrongEncryptionDataSpace')
  );
}

export function detectEncryptedFileFromBuffer(
  buffer: Buffer,
  input: Omit<FileDetectionInput, 'filePath'> & { filePath?: string } = {},
): SensitiveFileDetectionResult {
  const filePath = input.filePath ?? input.filename ?? '';
  if (buffer.length < 8) {
    return createFileDetectionResult(false);
  }

  const fileType = getFileType({ ...input, filePath }, buffer);

  if (fileType === 'pdf') {
    return createFileDetectionResult(isPdfEncrypted(buffer), fileType);
  }

  if (fileType === 'zip') {
    return createFileDetectionResult(isZipEncrypted(buffer), fileType);
  }

  if (fileType === 'seven_zip') {
    return createFileDetectionResult(isSevenZipEncrypted(buffer), fileType);
  }

  if (fileType === 'office') {
    return createFileDetectionResult(isOfficeEncrypted(buffer, { ...input, filePath }), fileType);
  }

  return createFileDetectionResult(false);
}

export function detectEncryptedFile(input: FileDetectionInput): SensitiveFileDetectionResult {
  if (!fs.existsSync(input.filePath)) {
    return createFileDetectionResult(false);
  }

  return detectEncryptedFileFromBuffer(fs.readFileSync(input.filePath), input);
}

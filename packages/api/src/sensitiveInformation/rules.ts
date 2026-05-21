export const SENSITIVE_DETECTION_VERSION = 1;

export const SENSITIVE_RULE_CODES = [
  'chinese_name',
  'credit_card_number',
  'tw_national_id',
  'mobile_phone_number',
  'landline_phone_number',
  'address',
  'email_address',
  'encrypted_file',
] as const;

export type SensitiveRuleCode = (typeof SENSITIVE_RULE_CODES)[number];

export type SensitiveRuleMatch = {
  ruleCode: SensitiveRuleCode;
  label: string;
  count: number;
};

export type SensitiveDetectionResult = {
  version: number;
  totalCount: number;
  ruleMatches: SensitiveRuleMatch[];
  evaluatedAt: Date;
};

export type SensitiveTextDetectionResult = SensitiveDetectionResult & {
  source: 'message_text';
};

export type SensitiveFileDetectionResult = SensitiveDetectionResult & {
  source: 'file_upload';
  encrypted: boolean;
  fileType?: 'zip' | 'seven_zip' | 'office' | 'pdf';
};

export const SENSITIVE_RULE_LABELS: Record<SensitiveRuleCode, string> = {
  address: '住址',
  chinese_name: '中文姓名',
  credit_card_number: '信用卡號',
  email_address: '電子郵件地址',
  encrypted_file: '加密檔案',
  landline_phone_number: '市話',
  mobile_phone_number: '手機號碼',
  tw_national_id: '身分證字號',
};

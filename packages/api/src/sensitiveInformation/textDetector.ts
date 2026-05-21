import {
  SENSITIVE_DETECTION_VERSION,
  SENSITIVE_RULE_LABELS,
  type SensitiveRuleCode,
  type SensitiveRuleMatch,
  type SensitiveTextDetectionResult,
} from './rules';

type RuleCounter = {
  ruleCode: SensitiveRuleCode;
  count: (text: string) => number;
};

const COMMON_CHINESE_SURNAMES =
  '王李張劉陳楊黃趙吳周徐孫馬朱胡郭何林羅鄭梁謝宋唐許韓馮鄧曹彭曾蕭田董袁潘於蔣蔡余杜葉程蘇魏呂丁任沈姚盧姜崔鍾譚陸汪范金石廖賈夏韋付方白鄒孟熊秦邱江尹薛閆段雷侯龍史陶黎賀顧毛郝龔邵萬錢嚴覃武戴莫孔向湯';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TW_ID_PATTERN = /\b[A-Z][12]\d{8}\b/gi;
const MOBILE_PATTERN = /(?<!\d)09\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)/g;
const LANDLINE_PATTERN = /(?<!\d)0[2-8][-－]?\d{3,4}[-－]?\d{4}(?!\d)/g;
const ADDRESS_PATTERN =
  /[\u4e00-\u9fff]{2,}(?:縣|市)[\u4e00-\u9fff]{0,12}(?:鄉|鎮|市|區)[\u4e00-\u9fff\d]{0,40}(?:路|街|大道|巷|弄)[\u4e00-\u9fff\d之號樓室\-－]{1,40}/g;
const CHINESE_NAME_PATTERN = new RegExp(
  `(?:姓名|客戶|使用者|用戶|收件人|寄件人|聯絡人|申請人|負責人|戶名)[:：\\s]*([${COMMON_CHINESE_SURNAMES}][\\u4e00-\\u9fff]{1,3})`,
  'g',
);
const CREDIT_CARD_CANDIDATE_PATTERN = /(?:\d[ -]?){13,19}/g;
const TW_ID_LETTER_CODES: Record<string, number> = {
  A: 10,
  B: 11,
  C: 12,
  D: 13,
  E: 14,
  F: 15,
  G: 16,
  H: 17,
  I: 34,
  J: 18,
  K: 19,
  L: 20,
  M: 21,
  N: 22,
  O: 35,
  P: 23,
  Q: 24,
  R: 25,
  S: 26,
  T: 27,
  U: 28,
  V: 29,
  W: 32,
  X: 30,
  Y: 31,
  Z: 33,
};

function countPatternMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches?.length ?? 0;
}

function isLuhnValid(value: string): boolean {
  let sum = 0;
  let shouldDouble = false;

  for (let index = value.length - 1; index >= 0; index--) {
    const digit = Number(value[index]);
    if (Number.isNaN(digit)) {
      return false;
    }

    if (shouldDouble) {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }

    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function countCreditCardNumbers(text: string): number {
  const candidates = text.match(CREDIT_CARD_CANDIDATE_PATTERN) ?? [];
  const normalizedValues = new Set<string>();

  for (const candidate of candidates) {
    const value = candidate.replace(/\D/g, '');
    if (value.length < 13 || value.length > 19 || !isLuhnValid(value)) {
      continue;
    }
    normalizedValues.add(value);
  }

  return normalizedValues.size;
}

function countChineseNames(text: string): number {
  const names = new Set<string>();
  for (const match of text.matchAll(CHINESE_NAME_PATTERN)) {
    const name = match[1];
    if (name) {
      names.add(name);
    }
  }
  return names.size;
}

function isTaiwanNationalIdValid(value: string): boolean {
  const normalizedValue = value.toUpperCase();
  const letterCode = TW_ID_LETTER_CODES[normalizedValue[0]];
  if (!letterCode) {
    return false;
  }

  const digits = normalizedValue.slice(1).split('').map(Number);
  if (digits.length !== 9 || digits.some(Number.isNaN)) {
    return false;
  }

  const sum =
    Math.floor(letterCode / 10) +
    (letterCode % 10) * 9 +
    digits[0] * 8 +
    digits[1] * 7 +
    digits[2] * 6 +
    digits[3] * 5 +
    digits[4] * 4 +
    digits[5] * 3 +
    digits[6] * 2 +
    digits[7] +
    digits[8];

  return sum % 10 === 0;
}

function countTaiwanNationalIds(text: string): number {
  const candidates = text.match(TW_ID_PATTERN) ?? [];
  const normalizedValues = new Set<string>();

  for (const candidate of candidates) {
    const value = candidate.toUpperCase();
    if (isTaiwanNationalIdValid(value)) {
      normalizedValues.add(value);
    }
  }

  return normalizedValues.size;
}

const TEXT_RULE_COUNTERS: RuleCounter[] = [
  { ruleCode: 'chinese_name', count: countChineseNames },
  { ruleCode: 'credit_card_number', count: countCreditCardNumbers },
  { ruleCode: 'tw_national_id', count: countTaiwanNationalIds },
  { ruleCode: 'mobile_phone_number', count: (text) => countPatternMatches(text, MOBILE_PATTERN) },
  { ruleCode: 'landline_phone_number', count: (text) => countPatternMatches(text, LANDLINE_PATTERN) },
  { ruleCode: 'address', count: (text) => countPatternMatches(text, ADDRESS_PATTERN) },
  { ruleCode: 'email_address', count: (text) => countPatternMatches(text, EMAIL_PATTERN) },
];

export function detectSensitiveText(text: string | undefined | null): SensitiveTextDetectionResult {
  const ruleMatches: SensitiveRuleMatch[] = [];
  const sourceText = text ?? '';

  for (const rule of TEXT_RULE_COUNTERS) {
    const count = rule.count(sourceText);
    if (count <= 0) {
      continue;
    }

    ruleMatches.push({
      count,
      ruleCode: rule.ruleCode,
      label: SENSITIVE_RULE_LABELS[rule.ruleCode],
    });
  }

  return {
    ruleMatches,
    source: 'message_text',
    evaluatedAt: new Date(),
    version: SENSITIVE_DETECTION_VERSION,
    totalCount: ruleMatches.reduce((sum, match) => sum + match.count, 0),
  };
}

export function hasSensitiveTextDetection(result: SensitiveTextDetectionResult): boolean {
  return result.totalCount > 0;
}

import { detectSensitiveText } from './textDetector';

describe('detectSensitiveText', () => {
  it('counts each sensitive information type separately', () => {
    const result = detectSensitiveText(
      [
        '姓名：王小明',
        '身分證 A123456789',
        '手機 0912-345-678',
        '市話 02-2345-6789',
        'email test@example.com',
        '地址 台北市信義區信義路五段7號',
        '信用卡 4111 1111 1111 1111',
      ].join('\n'),
    );

    expect(result.totalCount).toBe(7);
    expect(result.ruleMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleCode: 'chinese_name', count: 1 }),
        expect.objectContaining({ ruleCode: 'tw_national_id', count: 1 }),
        expect.objectContaining({ ruleCode: 'mobile_phone_number', count: 1 }),
        expect.objectContaining({ ruleCode: 'landline_phone_number', count: 1 }),
        expect.objectContaining({ ruleCode: 'email_address', count: 1 }),
        expect.objectContaining({ ruleCode: 'address', count: 1 }),
        expect.objectContaining({ ruleCode: 'credit_card_number', count: 1 }),
      ]),
    );
  });

  it('does not count invalid credit card candidates', () => {
    const result = detectSensitiveText('信用卡 4111 1111 1111 1112');

    expect(result.totalCount).toBe(0);
    expect(result.ruleMatches).toEqual([]);
  });

  it('does not count invalid Taiwan national ID candidates', () => {
    const result = detectSensitiveText('身分證 A123456780');

    expect(result.totalCount).toBe(0);
    expect(result.ruleMatches).toEqual([]);
  });

  it('returns a zero-count result when nothing matches', () => {
    const result = detectSensitiveText('這是一段一般聊天內容。');

    expect(result.totalCount).toBe(0);
    expect(result.ruleMatches).toEqual([]);
  });
});

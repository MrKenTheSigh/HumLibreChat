import { evaluateSensitivePolicy } from './policy';

describe('evaluateSensitivePolicy', () => {
  it('evaluates each rule independently and returns the strongest action', () => {
    const result = evaluateSensitivePolicy({
      ruleCounts: {
        email_address: 3,
        tw_national_id: 50,
      },
      policies: [
        {
          ruleCode: 'email_address',
          thresholds: [
            { minCount: 2, action: 'record' },
            { minCount: 50, action: 'block' },
          ],
        },
        {
          ruleCode: 'tw_national_id',
          thresholds: [
            { minCount: 2, action: 'warn' },
            { minCount: 50, action: 'block' },
          ],
        },
      ],
    });

    expect(result.action).toBe('block');
    expect(result.decisions).toEqual([
      expect.objectContaining({ ruleCode: 'email_address', count: 3, action: 'record' }),
      expect.objectContaining({ ruleCode: 'tw_national_id', count: 50, action: 'block' }),
    ]);
  });

  it('returns none when no threshold is reached', () => {
    const result = evaluateSensitivePolicy({
      ruleCounts: {
        email_address: 1,
      },
      policies: [
        {
          ruleCode: 'email_address',
          thresholds: [{ minCount: 2, action: 'record' }],
        },
      ],
    });

    expect(result.action).toBe('none');
    expect(result.decisions).toEqual([
      expect.objectContaining({ ruleCode: 'email_address', count: 1, action: 'none' }),
    ]);
  });

  it('includes the remaining count before block for warning decisions', () => {
    const result = evaluateSensitivePolicy({
      ruleCounts: {
        mobile_phone_number: 2,
      },
      policies: [
        {
          ruleCode: 'mobile_phone_number',
          thresholds: [
            { minCount: 1, action: 'record' },
            { minCount: 2, action: 'warn' },
            { minCount: 3, action: 'block' },
          ],
        },
      ],
    });

    expect(result.action).toBe('warn');
    expect(result.decisions).toEqual([
      expect.objectContaining({
        ruleCode: 'mobile_phone_number',
        count: 2,
        action: 'warn',
        nextBlockCount: 3,
        remainingToBlock: 1,
      }),
    ]);
  });
});

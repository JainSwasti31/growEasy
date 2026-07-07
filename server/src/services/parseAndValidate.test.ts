import { parseAndValidate } from './aiExtractor';
import type { RawRow } from '@groweasy/shared';

describe('parseAndValidate', () => {
  test('handles valid, invalid sourceRowIndex and ai-reported skipped rows', () => {
    const batch: RawRow[] = [
      { name: 'row0', email: 'a@example.com' },
      { name: 'row1', phone: '5551234' },
      { name: 'row2', note: 'no contact' },
    ];

    const aiResponse = {
      records: [
        // valid mapping to row0
        { sourceRowIndex: 0, email: 'a@example.com', mobile_without_country_code: '' },
        // invalid sourceRowIndex -> should fall back to batch position (idx=1)
        { sourceRowIndex: 99, email: 'b@example.com', mobile_without_country_code: '' },
        // present but missing contact -> should be skipped by rule
        { sourceRowIndex: 1, email: '', mobile_without_country_code: '' },
      ],
      skipped: [
        { rowIndex: 2, reason: 'ai_manual_skip' }
      ]
    };

    const rawText = JSON.stringify(aiResponse);

    const result = parseAndValidate(rawText, batch);

    // Expect two valid records (first and second)
    expect(result.records.length).toBe(2);

    // Records should not contain sourceRowIndex in returned records
    for (const r of result.records) {
      // @ts-ignore
      expect(r.sourceRowIndex).toBeUndefined();
    }

    // Expect skipped entries: one from validation (third record) + one from aiSkipped
    expect(result.skipped.length).toBe(2);

    // Ensure ai-reported skipped row resolved to original batch row (index 2)
    expect(result.skipped.some(s => s.row && (s.row as any).name === 'row2')).toBe(true);
  });
});

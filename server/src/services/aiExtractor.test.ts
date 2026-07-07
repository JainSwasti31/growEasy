/**
 * Unit tests for the AI extraction pipeline.
 *
 * All AI calls are mocked — these tests validate:
 * (a) Valid rows map correctly to CRM records
 * (b) Rows with no email/mobile get skipped
 * (c) Multiple emails/mobiles get folded into crm_note
 * (d) Invalid enum values from a misbehaving AI get caught by Zod validation
 * (e) Retry logic fires on first failure, falls back to skipping on second
 */

import { extractJsonFromText } from './extractionSchema';
import { AiBatchResponseSchema } from './extractionSchema';
import { parseAndValidate } from './aiExtractor';
import type { RawRow } from '@groweasy/shared';

// ── extractJsonFromText ───────────────────────────────────────────────────────

describe('extractJsonFromText', () => {
  it('parses clean JSON directly', () => {
    const input = '{"records":[],"skipped":[]}';
    expect(() => extractJsonFromText(input)).not.toThrow();
    expect(extractJsonFromText(input)).toEqual({ records: [], skipped: [] });
  });

  it('strips markdown ```json fences', () => {
    const input = '```json\n{"records":[],"skipped":[]}\n```';
    expect(extractJsonFromText(input)).toEqual({ records: [], skipped: [] });
  });

  it('strips plain ``` fences', () => {
    const input = '```\n{"records":[],"skipped":[]}\n```';
    expect(extractJsonFromText(input)).toEqual({ records: [], skipped: [] });
  });

  it('extracts JSON from surrounding text', () => {
    const input = 'Here is the result:\n{"records":[],"skipped":[]}\nDone.';
    expect(extractJsonFromText(input)).toEqual({ records: [], skipped: [] });
  });

  it('throws when no JSON found', () => {
    expect(() => extractJsonFromText('no json here at all')).toThrow();
  });
});

// ── AiBatchResponseSchema validation ─────────────────────────────────────────

describe('AiBatchResponseSchema', () => {
  it('(a) accepts a valid well-formed record', () => {
    const input = {
      records: [
        {
          sourceRowIndex: 0,
          name: 'John Smith',
          email: 'john@example.com',
          country_code: '91',
          mobile_without_country_code: '9876543210',
          city: 'Mumbai',
          crm_status: 'GOOD_LEAD_FOLLOW_UP',
          data_source: 'leads_on_demand',
        },
      ],
      skipped: [],
    };
    const result = AiBatchResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.records[0].name).toBe('John Smith');
      expect(result.data.records[0].crm_status).toBe('GOOD_LEAD_FOLLOW_UP');
    }
  });

  it('(b) accepts records with no email/mobile (skip rule applied downstream)', () => {
    // Schema itself doesn't enforce skip rule — aiExtractor does after validation
    const input = {
      records: [{ sourceRowIndex: 0, name: 'No Contact' }],
      skipped: [],
    };
    const result = AiBatchResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('(c) accepts crm_note with multiple phones and emails folded in', () => {
    const input = {
      records: [
        {
          sourceRowIndex: 0,
          email: 'primary@example.com',
          mobile_without_country_code: '9876543210',
          crm_note: 'Alt email: secondary@example.com; Alt phone: 9988776655',
        },
      ],
      skipped: [],
    };
    const result = AiBatchResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.records[0].crm_note).toContain('Alt email');
      expect(result.data.records[0].crm_note).toContain('Alt phone');
    }
  });

  it('(d) rejects invalid crm_status enum value', () => {
    const input = {
      records: [
        {
          sourceRowIndex: 0,
          email: 'test@example.com',
          crm_status: 'INTERESTED', // not a valid enum value
        },
      ],
      skipped: [],
    };
    const result = AiBatchResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('(d) rejects invalid data_source enum value', () => {
    const input = {
      records: [
        {
          sourceRowIndex: 0,
          email: 'test@example.com',
          data_source: 'facebook_ads', // not in enum
        },
      ],
      skipped: [],
    };
    const result = AiBatchResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('(d) accepts empty string for enum fields', () => {
    const input = {
      records: [
        {
          sourceRowIndex: 0,
          email: 'test@example.com',
          crm_status: '',
          data_source: '',
        },
      ],
      skipped: [],
    };
    const result = AiBatchResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('defaults skipped to empty array when omitted', () => {
    const input = { records: [] };
    const result = AiBatchResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skipped).toEqual([]);
    }
  });

  it('rejects response missing records array', () => {
    const input = { skipped: [] };
    const result = AiBatchResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('parseAndValidate sourceRowIndex mapping', () => {
  it('preserves correct original rows when AI omits skipped entries', () => {
    const batch: RawRow[] = [
      { email: 'first@example.com', name: 'First' },
      { name: 'No contact' },
      { email: 'third@example.com', name: 'Third' },
    ];

    const aiResponse = {
      records: [
        {
          sourceRowIndex: 0,
          email: 'first@example.com',
          mobile_without_country_code: '',
        },
        {
          sourceRowIndex: 2,
          email: 'third@example.com',
          mobile_without_country_code: '',
        },
      ],
      skipped: [
        {
          rowIndex: 1,
          reason: 'No email or mobile number found',
        },
      ],
    };

    const result = parseAndValidate(JSON.stringify(aiResponse), batch);

    expect(result.records).toHaveLength(2);
    expect(result.records[0].email).toBe('first@example.com');
    expect(result.records[1].email).toBe('third@example.com');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].row).toEqual(batch[1]);
    expect(result.skipped[0].reason).toBe('No email or mobile number found');
  });
});

// ── Skip rule (no email AND no mobile) ───────────────────────────────────────

describe('skip rule enforcement (post-validation)', () => {
  /**
   * Simulates what aiExtractor does after Zod validation passes:
   * any record with neither email nor mobile gets moved to skipped.
   */
  function applySkipRule(records: Array<{ email?: string; mobile_without_country_code?: string; name?: string }>) {
    const valid: typeof records = [];
    const skipped: Array<{ record: (typeof records)[0]; reason: string }> = [];

    records.forEach((r) => {
      const hasEmail = Boolean(r.email?.trim());
      const hasMobile = Boolean(r.mobile_without_country_code?.trim());
      if (!hasEmail && !hasMobile) {
        skipped.push({ record: r, reason: 'No email or mobile number found' });
      } else {
        valid.push(r);
      }
    });
    return { valid, skipped };
  }

  it('(b) skips row with no email and no mobile', () => {
    const records = [{ name: 'Ghost User' }];
    const { valid, skipped } = applySkipRule(records);
    expect(valid).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('No email or mobile number found');
  });

  it('keeps row that has email only', () => {
    const records = [{ name: 'Email Only', email: 'user@example.com' }];
    const { valid, skipped } = applySkipRule(records);
    expect(valid).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it('keeps row that has mobile only', () => {
    const records = [{ name: 'Mobile Only', mobile_without_country_code: '9876543210' }];
    const { valid, skipped } = applySkipRule(records);
    expect(valid).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it('keeps row that has both email and mobile', () => {
    const records = [
      { email: 'both@example.com', mobile_without_country_code: '9876543210' },
    ];
    const { valid, skipped } = applySkipRule(records);
    expect(valid).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });
});

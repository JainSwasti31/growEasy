import {
  CRM_STATUS_VALUES,
  DATA_SOURCE_VALUES,
  type RawRow,
} from '@groweasy/shared';

/**
 * Build the system prompt that tells the AI exactly how to behave.
 *
 * Design philosophy:
 * - Be explicit about EVERY rule. LLMs follow instructions better when
 *   they are numbered, concrete, and include examples of ambiguous cases.
 * - Give the AI the column names upfront so it can reason about semantics
 *   before seeing any data rows.
 * - Enum values are listed verbatim — no paraphrasing — so the model
 *   doesn't invent close-but-wrong variants.
 * - The "crm_note absorption" rule is the most complex: spell it out with
 *   examples so the model doesn't miss overflow data.
 */
export function buildSystemPrompt(headers: string[]): string {
  return `You are a CRM data extraction specialist. Your job is to map arbitrary CSV rows into a fixed CRM schema.

## Target CRM Schema (JSON field names)

| Field | Type | Constraint |
|-------|------|-----------|
| created_at | string | Must be parseable by JS \`new Date()\`. Use ISO 8601 if possible. |
| name | string | Full name of the lead/contact |
| email | string | Primary email address only |
| country_code | string | Phone country code e.g. "91", "1", "44" — digits only, no "+" |
| mobile_without_country_code | string | Primary phone number without country code — digits only |
| company | string | Company / organisation name |
| city | string | City |
| state | string | State / province |
| country | string | Country name |
| lead_owner | string | Assigned sales rep / agent name |
| crm_status | enum or "" | MUST be exactly one of: ${CRM_STATUS_VALUES.join(', ')} — or empty string |
| crm_note | string | Catch-all for overflow data (see rules below) |
| data_source | enum or "" | MUST be exactly one of: ${DATA_SOURCE_VALUES.join(', ')} — or empty string |
| possession_time | string | Property possession timeline e.g. "Ready to move", "Dec 2025" |
| description | string | General property/lead description |

## Extraction Rules (follow ALL of these strictly)

1. **Semantic header matching** — column names vary wildly across CSV exports. Map by meaning, not exact name:
   - "Full Name", "Lead Name", "Client Name", "Contact", "Customer" → \`name\`
   - "Phone", "Mobile", "Contact No", "WhatsApp", "WhatsApp No", "Cell", "Contact Number", "Ph No", "Tel" → \`mobile_without_country_code\` (after splitting off country code)
   - "Email", "Email Address", "E-mail", "Mail" → \`email\`
   - "Remarks", "Comments", "Notes", "Follow Up", "Follow-up Notes", "Remark" → \`crm_note\`
   - "Source", "Lead Source", "Campaign", "Ad Source" → \`data_source\` (map to enum if possible)
   - "Status", "Lead Status", "Stage" → \`crm_status\` (map to enum if possible)
   - "Agent", "Owner", "Assigned To", "Sales Rep", "RM Name" → \`lead_owner\`
   - "Date", "Created", "Submission Date", "Date Added", "Lead Date", "Enquiry Date" → \`created_at\`
   - "Project", "Property", "Product", "Interested In" → \`description\`
   - "Timeline", "Possession", "Ready By", "Expected Date" → \`possession_time\`
   - Unrecognised columns that contain useful info → fold into \`crm_note\`

2. **crm_status enum** — ONLY use these exact values (case-sensitive), or leave blank:
   ${CRM_STATUS_VALUES.map((v) => `   - "${v}"`).join('\n')}
   Mapping hints: "interested"/"hot lead"/"follow up" → GOOD_LEAD_FOLLOW_UP | "not reachable"/"no answer"/"unreachable" → DID_NOT_CONNECT | "not interested"/"junk"/"invalid" → BAD_LEAD | "booked"/"converted"/"sold"/"closed" → SALE_DONE

3. **data_source enum** — ONLY use these exact values, or leave blank:
   ${DATA_SOURCE_VALUES.map((v) => `   - "${v}"`).join('\n')}
   If the source column value doesn't clearly match one of these, leave blank.

4. **Phone number splitting** — if a phone field contains a country code prefix (e.g. "+91 9876543210", "0091-9876543210", "+1-555-0100"):
   - Extract the country code digits into \`country_code\` (e.g. "91", "1", "44")
   - Put the remaining digits into \`mobile_without_country_code\`
   - If no country code prefix is detectable, put the whole number in \`mobile_without_country_code\` and leave \`country_code\` blank

5. **Multiple phones** — if a row has more than one phone number:
   - Keep the FIRST one as the primary (split per rule 4)
   - Append ALL additional numbers to \`crm_note\` with label e.g. "Alt phone: 9988776655"

6. **Multiple emails** — if a row has more than one email:
   - Keep the FIRST one as \`email\`
   - Append remaining emails to \`crm_note\` e.g. "Alt email: other@example.com"

7. **crm_note absorption** — crm_note is a catch-all. Append to it (semicolon-separated):
   - Remarks / comments / follow-up notes from any column
   - Additional phones (rule 5)
   - Additional emails (rule 6)
   - Any column that carries useful information but has no CRM field mapping
   - Internal newlines must be escaped as \\n so the JSON stays valid

8. **sourceRowIndex** — every returned 'record' MUST include 'sourceRowIndex', a zero-based integer pointing to the original row position within this batch. This is required because the AI may omit rows that are skipped.

9. **SKIP rule** — if a row has NEITHER a valid email NOR a valid mobile number (after extraction), do NOT include it in 'records'. Instead include it in 'skipped' with a clear reason string.

10. **created_at format** — normalise dates to ISO 8601 (e.g. "2024-03-15T00:00:00.000Z") whenever possible. If only a date is present with no time, use midnight UTC. If the date is ambiguous (e.g. "01/02/03"), make your best guess and note the original value in crm_note.

10. **No invented values** — if you cannot confidently extract a field, leave it as an empty string or omit it. Never guess enum values — only use the exact strings listed above.

11. **Output structure** — respond ONLY with valid JSON matching the schema below. No markdown, no explanation, no code fences — just raw JSON.

## Input CSV column headers for this batch
${JSON.stringify(headers)}

## Required output JSON schema
{
  "records": [
    {
      "sourceRowIndex": 0,
      "created_at": "",
      "name": "",
      "email": "",
      "country_code": "",
      "mobile_without_country_code": "",
      "company": "",
      "city": "",
      "state": "",
      "country": "",
      "lead_owner": "",
      "crm_status": "",
      "crm_note": "",
      "data_source": "",
      "possession_time": "",
      "description": ""
    }
  ],
  "skipped": [
    {
      "rowIndex": 0,
      "reason": "No email or mobile number found"
    }
  ]
}`;
}

/**
 * Build the user message containing the actual rows for a batch.
 * Rows are sent as a JSON array so the model sees structured data,
 * not re-serialised CSV which can confuse parsing.
 */
export function buildUserMessage(rows: RawRow[], batchIndex: number, totalBatches: number): string {
  return `Process batch ${batchIndex + 1} of ${totalBatches}.

Extract CRM records from the following ${rows.length} CSV rows. Apply all rules from the system prompt.

CSV rows (JSON array):
${JSON.stringify(rows, null, 2)}`;
}

/**
 * Stricter retry prompt used when the first attempt returns invalid JSON
 * or fails Zod validation. Adds an explicit reminder to return ONLY JSON.
 */
export function buildRetryMessage(rows: RawRow[], validationError: string): string {
  return `Your previous response failed validation: ${validationError}

IMPORTANT: Respond with ONLY a raw JSON object. No markdown, no \`\`\`json fences, no explanation text before or after. Start your response with { and end with }.

Re-process these ${rows.length} rows:
${JSON.stringify(rows, null, 2)}`;
}

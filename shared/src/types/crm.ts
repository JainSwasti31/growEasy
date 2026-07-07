import { z } from 'zod';

/**
 * Allowed enum values for crm_status.
 * The AI must only return one of these or leave blank.
 */
export const CRM_STATUS_VALUES = [
  'GOOD_LEAD_FOLLOW_UP',
  'DID_NOT_CONNECT',
  'BAD_LEAD',
  'SALE_DONE',
] as const;

export type CrmStatus = (typeof CRM_STATUS_VALUES)[number];

/**
 * Allowed enum values for data_source.
 * The AI must only return one of these or leave blank.
 */
export const DATA_SOURCE_VALUES = [
  'leads_on_demand',
  'meridian_tower',
  'eden_park',
  'varah_swamy',
  'sarjapur_plots',
] as const;

export type DataSource = (typeof DATA_SOURCE_VALUES)[number];

/**
 * Zod schema for a single CRM record.
 * All fields are optional except the structural requirement that
 * at least one of email or mobile is present (enforced at extraction time).
 */
export const CrmRecordSchema = z.object({
  created_at: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  country_code: z.string().optional(),
  mobile_without_country_code: z.string().optional(),
  company: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  lead_owner: z.string().optional(),
  crm_status: z.enum(CRM_STATUS_VALUES).or(z.literal('')).optional(),
  crm_note: z.string().optional(),
  data_source: z.enum(DATA_SOURCE_VALUES).or(z.literal('')).optional(),
  possession_time: z.string().optional(),
  description: z.string().optional(),
});

export type CrmRecord = z.infer<typeof CrmRecordSchema>;

/**
 * A raw row from a CSV — keys are header column names, values are strings.
 * Column names are not assumed — they come directly from the CSV headers.
 */
export type RawRow = Record<string, string>;

import { z } from 'zod';
import { CrmRecordSchema } from '@groweasy/shared';

/**
 * Schema for a single skipped row as reported by the AI.
 */
export const AiSkippedRowSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  reason: z.string().min(1),
});

/**
 * Schema for a single CRM record augmented with source row metadata.
 */
export const AiRecordWithSourceSchema = CrmRecordSchema.extend({
  sourceRowIndex: z.number().int().nonnegative(),
});

export type AiRecordWithSource = z.infer<typeof AiRecordWithSourceSchema>;

/**
 * Schema for the full AI batch response.
 * Every field in each record is optional — the AI may omit fields it
 * can't confidently populate. We validate that enums are correct if present.
 */
export const AiBatchResponseSchema = z.object({
  records: z.array(AiRecordWithSourceSchema),
  skipped: z.array(AiSkippedRowSchema).default([]),
});

export type AiBatchResponse = z.infer<typeof AiBatchResponseSchema>;

/**
 * Attempt to extract a JSON object from a string that may contain
 * surrounding text, markdown fences, or other noise.
 *
 * Strategy:
 * 1. If the string parses cleanly as JSON, use it.
 * 2. Look for ```json ... ``` or ``` ... ``` fences and extract the content.
 * 3. Find the first { and last } and try parsing that substring.
 */
export function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();

  // 1. Direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // 2. Strip markdown fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // 3. Find outermost braces
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // continue
    }
  }

  throw new Error('Could not extract valid JSON from AI response');
}

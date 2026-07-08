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

  const candidates = [trimmed];

  // 1. Direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // 2. Strip markdown fences with optional language tag
  const fenceMatch = trimmed.match(/```(?:json|javascript|js|txt)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    candidates.push(fenceMatch[1].trim());
  }

  // 3. Remove leading/trailing prose around a JSON object/array
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (objectMatch?.[0]) {
    candidates.push(objectMatch[0]);
  }
  if (arrayMatch?.[0]) {
    candidates.push(arrayMatch[0]);
  }

  // 4. Try each candidate in turn
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  throw new Error('Could not extract valid JSON from AI response');
}

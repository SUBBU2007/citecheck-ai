import { z } from 'zod';

export const verdictSchema = z.enum([
  'supported',
  'weakly_supported',
  'mismatched',
  'unverifiable',
]);

/** Model output deliberately selects passage indexes instead of generating quotations. */
export const modelDecisionSchema = z.object({
  verdict: verdictSchema,
  explanation: z.string().trim().min(1).max(1600),
  evidenceSelections: z.array(z.object({
    referenceId: z.string().trim().min(1).max(200),
    evidenceIndex: z.number().int().nonnegative(),
  }).strict()).max(12),
  limitations: z.array(z.string().trim().min(1).max(500)).max(12),
}).strict();

export type ModelDecision = z.infer<typeof modelDecisionSchema>;

export const geminiJsonSchema = {
  type: 'OBJECT',
  properties: {
    verdict: {
      type: 'STRING',
      enum: ['supported', 'weakly_supported', 'mismatched', 'unverifiable'],
    },
    explanation: { type: 'STRING' },
    evidenceSelections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          referenceId: { type: 'STRING' },
          evidenceIndex: { type: 'INTEGER' },
        },
        required: ['referenceId', 'evidenceIndex'],
      },
    },
    limitations: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['verdict', 'explanation', 'evidenceSelections', 'limitations'],
} as const;

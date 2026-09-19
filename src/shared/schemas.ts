import { z } from 'zod';

// Shared between server (request validation) and client (form validation +
// inferred types for the API client) — this is the only reason this file
// depends on zod rather than staying dependency-free like the rest of
// src/shared.

export const loginSchema = z.object({
  passcode: z.string().min(1),
});

export const dancerCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  crew: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export const dancerUpdateSchema = dancerCreateSchema.partial();

export const tournamentCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  heldOn: z.string().datetime().optional(),
  targetScore: z.coerce.number().int().min(1).max(50).default(7),
  maxMatches: z.coerce.number().int().min(1).max(500).default(27),
  participants: z
    .array(z.object({ dancerId: z.string().min(1) }))
    .min(3, 'Need at least 3 dancers')
    .max(12, 'At most 12 dancers'),
});

export const matchSubmitSchema = z.object({
  expectedMatchNumber: z.coerce.number().int().min(1),
  kingParticipantId: z.string().min(1),
  challengerParticipantId: z.string().min(1),
  winnerParticipantId: z.string().min(1),
});

export const undoMatchSchema = z.object({
  expectedMatchNumber: z.coerce.number().int().min(1),
});

export const declareWinnerSchema = z.object({
  participantId: z.string().min(1),
});

export type LoginBody = z.infer<typeof loginSchema>;
export type DancerCreateBody = z.infer<typeof dancerCreateSchema>;
export type DancerUpdateBody = z.infer<typeof dancerUpdateSchema>;
export type TournamentCreateBody = z.infer<typeof tournamentCreateSchema>;
export type MatchSubmitBody = z.infer<typeof matchSubmitSchema>;
export type UndoMatchBody = z.infer<typeof undoMatchSchema>;
export type DeclareWinnerBody = z.infer<typeof declareWinnerSchema>;

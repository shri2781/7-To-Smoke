import type { EndReason, EngineState } from '@shared/types.js';

export type TournamentStatus = 'in_progress' | 'completed' | 'abandoned';

/** Mirrors src/server/lib/tournamentState.ts#buildTournamentResponse exactly. */
export type TournamentState = EngineState & {
  id: string;
  name: string;
  heldOn: string;
  status: TournamentStatus;
  targetScore: number;
  maxMatches: number;
  winnerParticipantId: string | null;
  endReason: EndReason | null;
  completedAt: string | null;
  abandonedAt: string | null;
};

export type TournamentSummary = {
  id: string;
  name: string;
  heldOn: string;
  status: TournamentStatus;
  targetScore: number;
  maxMatches: number;
  participantCount: number;
  matchesPlayed: number;
  winnerParticipantId: string | null;
  winnerName: string | null;
  endReason: EndReason | null;
  completedAt: string | null;
  abandonedAt: string | null;
};

export type Dancer = {
  id: string;
  name: string;
  crew: string | null;
  createdAt: string;
};

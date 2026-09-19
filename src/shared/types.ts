// Zero dependencies in this whole directory: no @prisma/client, no express,
// no react. It must be importable unchanged by the server (authoritative)
// and the client (instant optimistic rendering).

export type Rules = {
  targetScore: number;
  maxMatches: number;
};

export type ParticipantInput = {
  id: string;
  seed: number;
  name: string;
  crew: string | null;
  dancerId: string | null;
};

export type MatchInput = {
  matchNumber: number;
  kingId: string;
  challengerId: string;
  winnerId: string;
};

export type Phase = 'in_progress' | 'awaiting_manual_winner' | 'complete';

export type EndReason = 'target_reached' | 'cap_reached_manual' | 'forced';

export type Standing = {
  participantId: string;
  dancerId: string | null;
  name: string;
  crew: string | null;
  seed: number;

  rank: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winRate: number;
  pointsToTarget: number;

  currentStreak: number;
  longestStreak: number;

  isKing: boolean;
  isChallenger: boolean;
  queuePosition: number;

  /** Non-null only when standing order for a tied pair was broken by a
   * rule below "wins" — surfaced in the UI as a footnote so people don't
   * argue about a 3rd-place finish after the fact. */
  tiebreakReason: string | null;
};

export type MatchLogEntry = {
  matchNumber: number;
  kingId: string;
  challengerId: string;
  winnerId: string;
  loserId: string;
  kingName: string;
  challengerName: string;
  winnerName: string;
  /** true when the challenger beat the reigning king */
  throneChanged: boolean;
  winnerScoreAfter: number;
  scoresAfter: Record<string, number>;
};

export type CurrentMatch = {
  matchNumber: number;
  kingId: string;
  challengerId: string;
  /** consecutive wins the current king has strung together */
  kingStreak: number;
};

export type EngineState = {
  phase: Phase;
  /** Only ever set here for the fully-automatic case (someone hit the
   * target score). Manual/forced completions are recorded by the server
   * on the Tournament row and overlaid on top of this — see routes. */
  endReason: EndReason | null;

  matchesPlayed: number;
  nextMatchNumber: number;
  matchesRemainingInRegulation: number;

  /** null only when phase is 'complete' */
  currentMatch: CurrentMatch | null;

  /** full rotation order: [king, challenger, ...waiting] */
  queue: string[];
  /** queue.slice(2) — everyone not currently fighting */
  onDeck: string[];

  standings: Standing[];
  byId: Record<string, Standing>;

  winnerId: string | null;
  topScore: number;
  isTiedAtTop: boolean;

  log: MatchLogEntry[];
};

export type MatchSubmission = {
  expectedMatchNumber: number;
  kingId: string;
  challengerId: string;
  winnerId: string;
};

export type ValidationFailureCode =
  | 'STALE_MATCH_NUMBER'
  | 'INVALID_PAIRING'
  | 'TOURNAMENT_COMPLETED';

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: ValidationFailureCode };

export class EngineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

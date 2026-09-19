import type { MatchLogEntry, ParticipantInput, Standing } from './types.js';

export type StandingInput = {
  participant: ParticipantInput;
  wins: number;
  matchesPlayed: number;
  currentStreak: number;
  longestStreak: number;
  lastWinMatchNumber: number | null;
  isKing: boolean;
  isChallenger: boolean;
  queuePosition: number;
};

/**
 * Turns raw per-participant tallies into a fully ranked, strictly-ordered
 * Standing[]. This is DISPLAY ordering only — it never decides the title.
 * The tournament's actual winner is either derived automatically (someone
 * reached the target score) or recorded explicitly by an admin action
 * (declare-winner / force-end). See docs/rules for the full ladder.
 *
 * Order applied, each step only breaking ties left by the previous one:
 *   1. wins, descending
 *   2. head-to-head score against opponents tied on wins, descending
 *   3. currently holding the throne, descending (at most one qualifies)
 *   4. matches played, ascending (same wins in fewer bouts ranks higher)
 *   5. most recent match won, descending (momentum)
 *   6. seed, ascending (deterministic terminal fallback)
 */
export function rankStandings(inputs: StandingInput[], log: MatchLogEntry[], targetScore: number): Standing[] {
  const winsById = new Map(inputs.map((s) => [s.participant.id, s.wins]));
  const h2hScore = computeHeadToHeadScores(log, winsById);

  const withKeys = inputs.map((s) => {
    const h2h = h2hScore.get(s.participant.id) ?? 0;
    return {
      s,
      keys: [
        -s.wins,
        -h2h,
        s.isKing ? 0 : 1,
        s.matchesPlayed,
        // A finite sentinel, not Infinity: when two participants have both
        // never won, Infinity - Infinity is NaN, and a comparator that can
        // return NaN breaks sort's total-order assumption — on V8 this
        // manifested as the tie order depending on the *input array's*
        // order rather than being determined purely by the keys.
        s.lastWinMatchNumber === null ? Number.MAX_SAFE_INTEGER : -s.lastWinMatchNumber,
        s.participant.seed,
      ],
    };
  });

  withKeys.sort((a, b) => {
    for (let i = 0; i < a.keys.length; i++) {
      const diff = a.keys[i]! - b.keys[i]!;
      if (diff !== 0) return diff;
    }
    return 0;
  });

  return withKeys.map(({ s }, index) => {
    const losses = s.matchesPlayed - s.wins;
    const tiebreakReason = describeTiebreak(withKeys, index);
    return {
      participantId: s.participant.id,
      dancerId: s.participant.dancerId,
      name: s.participant.name,
      crew: s.participant.crew,
      seed: s.participant.seed,
      rank: index + 1,
      wins: s.wins,
      losses,
      matchesPlayed: s.matchesPlayed,
      winRate: s.matchesPlayed > 0 ? s.wins / s.matchesPlayed : 0,
      pointsToTarget: Math.max(0, targetScore - s.wins),
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
      isKing: s.isKing,
      isChallenger: s.isChallenger,
      queuePosition: s.queuePosition,
      tiebreakReason,
    } satisfies Standing;
  });
}

function computeHeadToHeadScores(log: MatchLogEntry[], winsById: Map<string, number>): Map<string, number> {
  const score = new Map<string, number>();
  for (const entry of log) {
    const kingFinalWins = winsById.get(entry.kingId) ?? 0;
    const challengerFinalWins = winsById.get(entry.challengerId) ?? 0;
    // Only counts toward head-to-head if the two combatants finished the
    // tournament tied with each other on total wins — a scalar
    // approximation of "tied group" that stays a simple additive score
    // rather than needing recursive group resolution.
    if (kingFinalWins !== challengerFinalWins) continue;
    const kingDelta = entry.winnerId === entry.kingId ? 1 : -1;
    score.set(entry.kingId, (score.get(entry.kingId) ?? 0) + kingDelta);
    score.set(entry.challengerId, (score.get(entry.challengerId) ?? 0) - kingDelta);
  }
  return score;
}

function describeTiebreak(withKeys: { s: StandingInput; keys: number[] }[], index: number): string | null {
  if (index === 0) return null;
  const prev = withKeys[index - 1]!.keys;
  const cur = withKeys[index]!.keys;
  if (prev[0] !== cur[0]) return null; // wins differ — no tiebreak needed
  if (prev[1] !== cur[1]) return 'head-to-head record';
  if (prev[2] !== cur[2]) return 'held the throne';
  if (prev[3] !== cur[3]) return 'fewer bouts played';
  if (prev[4] !== cur[4]) return 'most recent win';
  return 'seed order';
}

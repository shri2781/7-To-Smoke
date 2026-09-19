import { rankStandings, type StandingInput } from './ranking.js';
import {
  EngineError,
  type EngineState,
  type MatchInput,
  type MatchLogEntry,
  type MatchSubmission,
  type ParticipantInput,
  type Rules,
  type ValidationResult,
} from './types.js';

/**
 * Replays a tournament's full match log from scratch and returns everything
 * the UI needs to render — the current bout, the rotation queue, ranked
 * standings, and the enriched log. Nothing about a live tournament is
 * stored pre-computed; this is cheap enough (a few hundred operations for
 * a full 27-match run) that re-running it on every request is not a
 * performance concern.
 *
 * Rotation semantics (queue[0] = king, queue[1] = challenger): after a
 * bout the LOSER is removed from their spot and pushed to the back of the
 * queue, so queue[0] is always the winner afterward, whether or not the
 * throne changed hands.
 *
 * Throws EngineError on any log that isn't a valid replay of these rules —
 * a non-contiguous matchNumber sequence, a winner who wasn't one of the
 * two combatants, or a pairing that doesn't match the replayed queue.
 * Since "the log fully determines the state" is the whole design, silent
 * tolerance of a corrupt log would hide the corruption instead of
 * surfacing it.
 */
export function computeState(
  participants: ParticipantInput[],
  matches: MatchInput[],
  rules: Rules,
): EngineState {
  if (participants.length < 2) {
    throw new EngineError('TOO_FEW_PARTICIPANTS', 'A tournament needs at least 2 participants.');
  }

  const byId = new Map(participants.map((p) => [p.id, p]));
  const seeds = new Set<number>();
  for (const p of participants) {
    if (seeds.has(p.seed)) {
      throw new EngineError('DUPLICATE_SEED', `Seed ${p.seed} is used by more than one participant.`);
    }
    seeds.add(p.seed);
  }

  const sortedMatches = [...matches].sort((a, b) => a.matchNumber - b.matchNumber);
  sortedMatches.forEach((m, i) => {
    if (m.matchNumber !== i + 1) {
      throw new EngineError(
        'NON_CONTIGUOUS_MATCH_LOG',
        `Expected matchNumber ${i + 1} but found ${m.matchNumber}.`,
      );
    }
  });

  const queue = [...participants].sort((a, b) => a.seed - b.seed).map((p) => p.id);

  const wins = new Map<string, number>(participants.map((p) => [p.id, 0]));
  const matchesPlayedCount = new Map<string, number>(participants.map((p) => [p.id, 0]));
  const currentStreak = new Map<string, number>(participants.map((p) => [p.id, 0]));
  const longestStreak = new Map<string, number>(participants.map((p) => [p.id, 0]));
  const lastWinMatchNumber = new Map<string, number | null>(participants.map((p) => [p.id, null]));

  const log: MatchLogEntry[] = [];

  for (const match of sortedMatches) {
    const expectedKing = queue[0];
    const expectedChallenger = queue[1];
    if (match.kingId !== expectedKing || match.challengerId !== expectedChallenger) {
      throw new EngineError(
        'INVALID_PAIRING',
        `Match ${match.matchNumber} pairs ${match.kingId} vs ${match.challengerId}, ` +
          `but the replayed queue expects ${expectedKing} vs ${expectedChallenger}.`,
      );
    }
    if (match.winnerId !== match.kingId && match.winnerId !== match.challengerId) {
      throw new EngineError(
        'INVALID_WINNER',
        `Match ${match.matchNumber}'s winner must be the king or the challenger.`,
      );
    }

    const kingLost = match.winnerId === match.challengerId;
    const loserIdx = kingLost ? 0 : 1;
    const loserId = queue[loserIdx]!;
    const winnerId = match.winnerId;

    queue.push(queue[loserIdx]!);
    queue.splice(loserIdx, 1);

    wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1);
    matchesPlayedCount.set(match.kingId, (matchesPlayedCount.get(match.kingId) ?? 0) + 1);
    matchesPlayedCount.set(match.challengerId, (matchesPlayedCount.get(match.challengerId) ?? 0) + 1);

    if (kingLost) {
      currentStreak.set(match.kingId, 0);
      currentStreak.set(winnerId, 1);
    } else {
      currentStreak.set(winnerId, (currentStreak.get(winnerId) ?? 0) + 1);
    }
    longestStreak.set(winnerId, Math.max(longestStreak.get(winnerId) ?? 0, currentStreak.get(winnerId) ?? 0));
    lastWinMatchNumber.set(winnerId, match.matchNumber);

    const winnerP = byId.get(winnerId)!;
    const kingP = byId.get(match.kingId)!;
    const challengerP = byId.get(match.challengerId)!;
    log.push({
      matchNumber: match.matchNumber,
      kingId: match.kingId,
      challengerId: match.challengerId,
      winnerId,
      loserId,
      kingName: kingP.name,
      challengerName: challengerP.name,
      winnerName: winnerP.name,
      throneChanged: kingLost,
      winnerScoreAfter: wins.get(winnerId)!,
      scoresAfter: Object.fromEntries(wins),
    });
  }

  const matchesPlayed = sortedMatches.length;
  const topScore = Math.max(...participants.map((p) => wins.get(p.id) ?? 0));
  const topScorers = participants.filter((p) => (wins.get(p.id) ?? 0) === topScore);
  const isTiedAtTop = topScorers.length > 1;

  const targetReacher = participants.find((p) => (wins.get(p.id) ?? 0) >= rules.targetScore);

  const phase: EngineState['phase'] = targetReacher
    ? 'complete'
    : matchesPlayed >= rules.maxMatches
      ? 'awaiting_manual_winner'
      : 'in_progress';

  const standingInputs: StandingInput[] = participants.map((p) => ({
    participant: p,
    wins: wins.get(p.id) ?? 0,
    matchesPlayed: matchesPlayedCount.get(p.id) ?? 0,
    currentStreak: currentStreak.get(p.id) ?? 0,
    longestStreak: longestStreak.get(p.id) ?? 0,
    lastWinMatchNumber: lastWinMatchNumber.get(p.id) ?? null,
    isKing: queue[0] === p.id,
    isChallenger: queue[1] === p.id,
    queuePosition: queue.indexOf(p.id),
  }));

  const standings = rankStandings(standingInputs, log, rules.targetScore);
  const standingsById = Object.fromEntries(standings.map((s) => [s.participantId, s]));

  const currentMatch =
    phase === 'complete' || queue.length < 2
      ? null
      : {
          matchNumber: matchesPlayed + 1,
          kingId: queue[0]!,
          challengerId: queue[1]!,
          kingStreak: currentStreak.get(queue[0]!) ?? 0,
        };

  return {
    phase,
    endReason: targetReacher ? 'target_reached' : null,
    matchesPlayed,
    nextMatchNumber: matchesPlayed + 1,
    matchesRemainingInRegulation: Math.max(0, rules.maxMatches - matchesPlayed),
    currentMatch,
    queue,
    onDeck: queue.slice(2),
    standings,
    byId: standingsById,
    winnerId: targetReacher ? targetReacher.id : null,
    topScore,
    isTiedAtTop,
    log,
  };
}

/** Validated by the server before every write; exported so both the API
 * route and its tests can share one source of truth for "is this
 * submission acceptable right now". */
export function validateSubmission(state: EngineState, submission: MatchSubmission): ValidationResult {
  if (state.phase === 'complete') {
    return { ok: false, code: 'TOURNAMENT_COMPLETED' };
  }
  if (submission.expectedMatchNumber !== state.nextMatchNumber) {
    return { ok: false, code: 'STALE_MATCH_NUMBER' };
  }
  if (!state.currentMatch) {
    return { ok: false, code: 'INVALID_PAIRING' };
  }
  if (
    submission.kingId !== state.currentMatch.kingId ||
    submission.challengerId !== state.currentMatch.challengerId
  ) {
    return { ok: false, code: 'INVALID_PAIRING' };
  }
  if (submission.winnerId !== submission.kingId && submission.winnerId !== submission.challengerId) {
    return { ok: false, code: 'INVALID_PAIRING' };
  }
  return { ok: true };
}

export { EngineError } from './types.js';
export type * from './types.js';

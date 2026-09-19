import { computeState } from '@shared/engine.js';
import type { MatchInput, ParticipantInput, Rules } from '@shared/types.js';
import type { TournamentState } from '../api/types.js';

/** Every field computeState needs travels inside a TournamentState
 * response already (standings carry seed/name/crew/dancerId, log carries
 * the full match history) — so the client can re-derive engine inputs
 * from a plain GET response and re-run the exact same pure function the
 * server did, for instant optimistic rendering. */
export function participantsFrom(state: TournamentState): ParticipantInput[] {
  return state.standings.map((s) => ({
    id: s.participantId,
    seed: s.seed,
    name: s.name,
    crew: s.crew,
    dancerId: s.dancerId,
  }));
}

export function matchesFrom(state: TournamentState): MatchInput[] {
  return state.log.map((l) => ({
    matchNumber: l.matchNumber,
    kingId: l.kingId,
    challengerId: l.challengerId,
    winnerId: l.winnerId,
  }));
}

export function rulesFrom(state: TournamentState): Rules {
  return { targetScore: state.targetScore, maxMatches: state.maxMatches };
}

/** Computes what the state WOULD be after one more match, purely
 * client-side — used to render a tap's outcome instantly, before the
 * network round trip confirms it. */
export function optimisticallyApplyMatch(
  state: TournamentState,
  submission: { matchNumber: number; kingId: string; challengerId: string; winnerId: string },
): TournamentState {
  const participants = participantsFrom(state);
  const matches = [...matchesFrom(state), submission];
  const engineState = computeState(participants, matches, rulesFrom(state));
  return { ...state, ...engineState };
}

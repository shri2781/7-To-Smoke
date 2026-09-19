import type { Dancer, Match, Participant, Tournament } from '@prisma/client';
import { computeState } from '@shared/engine.js';
import type { EngineState, MatchInput, ParticipantInput, Rules } from '@shared/types.js';

export type TournamentWithRelations = Tournament & {
  participants: Participant[];
  matches: Match[];
};

export function toParticipantInput(p: Participant): ParticipantInput {
  return {
    id: p.id,
    seed: p.seed,
    name: p.displayName,
    crew: p.displayCrew,
    dancerId: p.dancerId,
  };
}

export function toMatchInput(m: Match): MatchInput {
  return {
    matchNumber: m.matchNumber,
    kingId: m.kingParticipantId,
    challengerId: m.challengerParticipantId,
    winnerId: m.winnerParticipantId,
  };
}

export function rulesOf(t: Tournament): Rules {
  return { targetScore: t.targetScore, maxMatches: t.maxMatches };
}

/** The full payload every tournament-mutating endpoint returns. Completed
 * tournaments serve their immutable `finalStandings` snapshot rather than
 * replaying — see the model comment in schema.prisma for why. */
export function buildTournamentResponse(t: TournamentWithRelations) {
  const base = {
    id: t.id,
    name: t.name,
    heldOn: t.heldOn,
    status: t.status,
    targetScore: t.targetScore,
    maxMatches: t.maxMatches,
    winnerParticipantId: t.winnerParticipantId,
    endReason: t.endReason,
    completedAt: t.completedAt,
    abandonedAt: t.abandonedAt,
  };

  if (t.status === 'completed' && t.finalStandings) {
    return { ...base, ...(t.finalStandings as unknown as EngineState) };
  }

  const state = computeState(
    t.participants.map(toParticipantInput),
    t.matches.map(toMatchInput),
    rulesOf(t),
  );
  return { ...base, ...state };
}

export type DancerSummary = Pick<Dancer, 'id' | 'name' | 'crew'>;

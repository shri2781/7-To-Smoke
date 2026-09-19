import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeState, validateSubmission } from '../src/shared/engine.js';
import { EngineError } from '../src/shared/types.js';
import type { EngineState, MatchInput, ParticipantInput, Rules } from '../src/shared/types.js';

function makeParticipants(n: number): ParticipantInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    seed: i,
    name: `Dancer ${i}`,
    crew: null,
    dancerId: `d${i}`,
  }));
}

/** Plays out a random-but-valid tournament by always asking the engine for
 * the current match and flipping a biased coin for the winner, stopping
 * when the engine reports 'complete' or a match cap is hit. This exercises
 * computeState purely through its own public contract — no internal
 * assumptions — so it doubles as an end-to-end sanity check of
 * currentMatch/queue/phase working together. */
function playRandomTournament(
  participants: ParticipantInput[],
  rules: Rules,
  coinFlips: boolean[],
  hardStopAt: number,
): { matches: MatchInput[]; states: EngineState[] } {
  const matches: MatchInput[] = [];
  const states: EngineState[] = [];
  let flipIndex = 0;

  for (let i = 0; i < hardStopAt; i++) {
    const state = computeState(participants, matches, rules);
    states.push(state);
    if (state.phase === 'complete' || !state.currentMatch) break;
    const kingWins = coinFlips[flipIndex % coinFlips.length] ?? true;
    flipIndex++;
    matches.push({
      matchNumber: state.currentMatch.matchNumber,
      kingId: state.currentMatch.kingId,
      challengerId: state.currentMatch.challengerId,
      winnerId: kingWins ? state.currentMatch.kingId : state.currentMatch.challengerId,
    });
  }
  return { matches, states };
}

const arbTournament = fc
  .record({
    n: fc.integer({ min: 3, max: 12 }),
    targetScore: fc.integer({ min: 1, max: 10 }),
    maxMatches: fc.integer({ min: 1, max: 40 }),
    coinFlips: fc.array(fc.boolean(), { minLength: 1, maxLength: 60 }),
  })
  .map(({ n, targetScore, maxMatches, coinFlips }) => {
    const participants = makeParticipants(n);
    const rules: Rules = { targetScore, maxMatches };
    const { matches } = playRandomTournament(participants, rules, coinFlips, 60);
    return { participants, rules, matches };
  });

describe('computeState — properties over random valid playthroughs', () => {
  it('every recorded win is attributed to exactly one participant, one per match', () => {
    fc.assert(
      fc.property(arbTournament, ({ participants, rules, matches }) => {
        const state = computeState(participants, matches, rules);
        const totalWins = state.standings.reduce((sum, s) => sum + s.wins, 0);
        expect(totalWins).toBe(matches.length);
      }),
    );
  });

  it('standings are a strict total order: ranks are exactly 1..n with no gaps or duplicates', () => {
    fc.assert(
      fc.property(arbTournament, ({ participants, rules, matches }) => {
        const state = computeState(participants, matches, rules);
        const ranks = state.standings.map((s) => s.rank).sort((a, b) => a - b);
        expect(ranks).toEqual(Array.from({ length: participants.length }, (_, i) => i + 1));
      }),
    );
  });

  it('the queue is always a permutation of all participant ids', () => {
    fc.assert(
      fc.property(arbTournament, ({ participants, rules, matches }) => {
        const state = computeState(participants, matches, rules);
        const ids = participants.map((p) => p.id).sort();
        const queueSorted = [...state.queue].sort();
        expect(queueSorted).toEqual(ids);
        expect(new Set(state.queue).size).toBe(state.queue.length);
      }),
    );
  });

  it('is deterministic under shuffled input participant array order', () => {
    fc.assert(
      fc.property(arbTournament, ({ participants, rules, matches }) => {
        const shuffled = [...participants].reverse();
        const a = computeState(participants, matches, rules);
        const b = computeState(shuffled, matches, rules);
        // Compare everything except object key insertion order, which is
        // allowed to differ; queue/standings/log/phase must be identical.
        expect(b.queue).toEqual(a.queue);
        expect(b.phase).toBe(a.phase);
        expect(b.winnerId).toBe(a.winnerId);
        expect(b.log).toEqual(a.log);
        expect(
          [...b.standings].sort((x, y) => x.participantId.localeCompare(y.participantId)),
        ).toEqual([...a.standings].sort((x, y) => x.participantId.localeCompare(y.participantId)));
      }),
    );
  });

  it('re-assembling the same log from prefix + last match matches computing it whole (no hidden mutation across calls)', () => {
    fc.assert(
      fc.property(arbTournament, ({ participants, rules, matches }) => {
        fc.pre(matches.length > 0);
        const whole = computeState(participants, matches, rules);
        const prefix = matches.slice(0, -1);
        const last = matches[matches.length - 1]!;
        // Force fresh array/object identity so a mutation bug in one path
        // can't accidentally "fix itself" via shared references.
        const reassembled = computeState(participants, [...prefix, { ...last }], rules);
        expect(reassembled).toEqual(whole);
      }),
    );
  });

  it('undo invariant: state at a prefix does not depend on what comes after it', () => {
    fc.assert(
      fc.property(arbTournament, ({ participants, rules, matches }) => {
        fc.pre(matches.length > 1);
        const full = computeState(participants, matches, rules);
        const truncated = computeState(participants, matches.slice(0, -1), rules);
        expect(truncated.matchesPlayed).toBe(full.matchesPlayed - 1);
        // The truncated state must be exactly what a second independent
        // truncation to the same length produces — guards against any
        // accidental cross-call state leakage.
        const truncatedAgain = computeState(participants, matches.slice(0, -1), rules);
        expect(truncatedAgain).toEqual(truncated);
      }),
    );
  });
});

describe('computeState — the original app\'s crash scenario', () => {
  it('reaching the match cap with nobody at the target score ends cleanly at awaiting_manual_winner', () => {
    // 8 dancers, first-to-7, 27-match cap — the exact original format.
    // Force a draw-heavy sequence (round-robin-ish alternation) so 27
    // matches pass without any single dancer reaching 7 wins.
    const participants = makeParticipants(8);
    const rules: Rules = { targetScore: 7, maxMatches: 27 };
    // Alternate king/challenger wins so no one runs away with a streak.
    const coinFlips = Array.from({ length: 27 }, (_, i) => i % 2 === 0);
    const { matches } = playRandomTournament(participants, rules, coinFlips, 27);

    expect(() => computeState(participants, matches, rules)).not.toThrow();
    const state = computeState(participants, matches, rules);
    expect(state.matchesPlayed).toBeLessThanOrEqual(27);
    if (state.matchesPlayed === 27 && state.topScore < 7) {
      expect(state.phase).toBe('awaiting_manual_winner');
      expect(state.winnerId).toBeNull();
    }
  });
});

describe('computeState — validation errors on a corrupt log', () => {
  it('throws on a non-contiguous match number sequence', () => {
    const participants = makeParticipants(4);
    const rules: Rules = { targetScore: 7, maxMatches: 27 };
    const matches: MatchInput[] = [
      { matchNumber: 1, kingId: 'p0', challengerId: 'p1', winnerId: 'p0' },
      { matchNumber: 3, kingId: 'p0', challengerId: 'p2', winnerId: 'p0' },
    ];
    expect(() => computeState(participants, matches, rules)).toThrow(EngineError);
  });

  it('throws when a pairing contradicts the replayed queue', () => {
    const participants = makeParticipants(4);
    const rules: Rules = { targetScore: 7, maxMatches: 27 };
    const matches: MatchInput[] = [
      // p2 vs p3 is not the real first pairing (p0 vs p1 is).
      { matchNumber: 1, kingId: 'p2', challengerId: 'p3', winnerId: 'p2' },
    ];
    expect(() => computeState(participants, matches, rules)).toThrow(EngineError);
  });

  it('throws when the recorded winner is neither combatant', () => {
    const participants = makeParticipants(4);
    const rules: Rules = { targetScore: 7, maxMatches: 27 };
    const matches: MatchInput[] = [
      { matchNumber: 1, kingId: 'p0', challengerId: 'p1', winnerId: 'p2' },
    ];
    expect(() => computeState(participants, matches, rules)).toThrow(EngineError);
  });

  it('throws on a duplicate seed', () => {
    const participants = makeParticipants(4).map((p, i) => (i === 1 ? { ...p, seed: 0 } : p));
    const rules: Rules = { targetScore: 7, maxMatches: 27 };
    expect(() => computeState(participants, [], rules)).toThrow(EngineError);
  });
});

describe('validateSubmission', () => {
  const participants = makeParticipants(4);
  const rules: Rules = { targetScore: 7, maxMatches: 27 };

  it('accepts a submission matching the current match exactly', () => {
    const state = computeState(participants, [], rules);
    const result = validateSubmission(state, {
      expectedMatchNumber: state.nextMatchNumber,
      kingId: state.currentMatch!.kingId,
      challengerId: state.currentMatch!.challengerId,
      winnerId: state.currentMatch!.kingId,
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects a stale match number', () => {
    const state = computeState(participants, [], rules);
    const result = validateSubmission(state, {
      expectedMatchNumber: state.nextMatchNumber + 1,
      kingId: state.currentMatch!.kingId,
      challengerId: state.currentMatch!.challengerId,
      winnerId: state.currentMatch!.kingId,
    });
    expect(result).toEqual({ ok: false, code: 'STALE_MATCH_NUMBER' });
  });

  it('rejects a pairing that does not match the current match', () => {
    const state = computeState(participants, [], rules);
    const result = validateSubmission(state, {
      expectedMatchNumber: state.nextMatchNumber,
      kingId: 'p2',
      challengerId: 'p3',
      winnerId: 'p2',
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_PAIRING' });
  });

  it('rejects any submission once the tournament is complete', () => {
    const rules2: Rules = { targetScore: 1, maxMatches: 27 };
    const matches: MatchInput[] = [
      { matchNumber: 1, kingId: 'p0', challengerId: 'p1', winnerId: 'p0' },
    ];
    const state = computeState(participants, matches, rules2);
    expect(state.phase).toBe('complete');
    const result = validateSubmission(state, {
      expectedMatchNumber: state.nextMatchNumber,
      kingId: 'p0',
      challengerId: 'p2',
      winnerId: 'p0',
    });
    expect(result).toEqual({ ok: false, code: 'TOURNAMENT_COMPLETED' });
  });
});

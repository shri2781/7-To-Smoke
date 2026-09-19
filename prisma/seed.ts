// Seeds a roster plus one fully-played, completed tournament, so History
// has something to show before that screen exists.
// Run with: npm run seed
import { PrismaClient, Prisma } from '@prisma/client';
import { computeState } from '../src/shared/engine.js';
import type { EngineState, MatchInput, ParticipantInput } from '../src/shared/types.js';

const prisma = new PrismaClient();

const ROSTER: { name: string; crew: string | null }[] = [
  { name: 'Arjun', crew: 'Kinetic Sparks' },
  { name: 'Meera', crew: 'Groove Theory' },
  { name: 'Rahul', crew: 'Silver Step' },
  { name: 'Divya', crew: 'Kinetic Sparks' },
  { name: 'Karthik', crew: 'Floor Kings' },
  { name: 'Ananya', crew: 'Groove Theory' },
  { name: 'Vikram', crew: null },
  { name: 'Priya', crew: 'Floor Kings' },
];

// Deterministic pseudo-random winner picks so the seed is reproducible.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  console.log('Seeding dancers...');
  const dancers = [];
  for (const entry of ROSTER) {
    const existing = await prisma.dancer.findFirst({ where: { name: entry.name, crew: entry.crew } });
    dancers.push(existing ?? (await prisma.dancer.create({ data: entry })));
  }

  const existingActive = await prisma.tournament.findFirst({ where: { status: 'in_progress' } });
  if (existingActive) {
    console.log('An in_progress tournament already exists — skipping demo tournament creation.');
    return;
  }

  console.log('Playing out a demo tournament...');
  const rng = mulberry32(42);
  const rules = { targetScore: 7, maxMatches: 27 };
  const participantInputs: ParticipantInput[] = dancers.map((d, seed) => ({
    id: `seed-${d.id}`,
    seed,
    name: d.name,
    crew: d.crew,
    dancerId: d.id,
  }));

  const matches: MatchInput[] = [];
  let finalState: EngineState | null = null;
  for (let i = 0; i < rules.maxMatches; i++) {
    const state = computeState(participantInputs, matches, rules);
    if (state.phase !== 'in_progress' || !state.currentMatch) {
      finalState = state;
      break;
    }
    const kingWins = rng() < 0.62; // kings hold court more often than not
    matches.push({
      matchNumber: state.currentMatch.matchNumber,
      kingId: state.currentMatch.kingId,
      challengerId: state.currentMatch.challengerId,
      winnerId: kingWins ? state.currentMatch.kingId : state.currentMatch.challengerId,
    });
  }
  if (!finalState) finalState = computeState(participantInputs, matches, rules);

  // If the cap was hit without a target reached, declare the top scorer
  // champion (mirrors what an admin would tap in the real app).
  if (finalState.phase !== 'complete') {
    finalState = {
      ...finalState,
      phase: 'complete',
      endReason: 'cap_reached_manual',
      winnerId: finalState.standings[0]!.participantId,
      currentMatch: null,
    };
  }

  const created = await prisma.tournament.create({
    data: {
      name: 'Festember Demo Battle',
      heldOn: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      status: 'completed',
      targetScore: rules.targetScore,
      maxMatches: rules.maxMatches,
      winnerParticipantId: finalState.winnerId,
      endReason: finalState.endReason,
      completedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
      finalStandings: finalState as unknown as Prisma.InputJsonValue,
      participants: {
        create: participantInputs.map((p) => ({
          dancerId: p.dancerId!,
          seed: p.seed,
          displayName: p.name,
          displayCrew: p.crew,
        })),
      },
    },
    include: { participants: true },
  });

  // Map the throwaway seed-time participant ids to the real DB ids (Prisma
  // assigns its own cuids on create) before writing the match log.
  const idBySeed = new Map(created.participants.map((p) => [p.seed, p.id]));
  await prisma.match.createMany({
    data: matches.map((m) => {
      const kingSeed = participantInputs.find((p) => p.id === m.kingId)!.seed;
      const challengerSeed = participantInputs.find((p) => p.id === m.challengerId)!.seed;
      const winnerSeed = participantInputs.find((p) => p.id === m.winnerId)!.seed;
      return {
        tournamentId: created.id,
        matchNumber: m.matchNumber,
        kingParticipantId: idBySeed.get(kingSeed)!,
        challengerParticipantId: idBySeed.get(challengerSeed)!,
        winnerParticipantId: idBySeed.get(winnerSeed)!,
      };
    }),
  });

  // Re-point winnerParticipantId / finalStandings at the real participant
  // ids now that they exist.
  const remapId = (seedId: string) => idBySeed.get(participantInputs.find((p) => p.id === seedId)!.seed)!;
  const remappedState: EngineState = {
    ...finalState,
    winnerId: finalState.winnerId ? remapId(finalState.winnerId) : null,
    queue: finalState.queue.map(remapId),
    onDeck: finalState.onDeck.map(remapId),
    standings: finalState.standings.map((s) => ({ ...s, participantId: remapId(s.participantId) })),
    byId: Object.fromEntries(Object.entries(finalState.byId).map(([k, v]) => [remapId(k), { ...v, participantId: remapId(k) }])),
    log: finalState.log.map((l) => ({
      ...l,
      kingId: remapId(l.kingId),
      challengerId: remapId(l.challengerId),
      winnerId: remapId(l.winnerId),
      loserId: remapId(l.loserId),
      scoresAfter: Object.fromEntries(Object.entries(l.scoresAfter).map(([k, v]) => [remapId(k), v])),
    })),
  };

  await prisma.tournament.update({
    where: { id: created.id },
    data: {
      winnerParticipantId: remappedState.winnerId,
      finalStandings: remappedState as unknown as Prisma.InputJsonValue,
    },
  });

  console.log(`Seeded tournament "${created.name}" (${matches.length} matches, winner: ${remappedState.winnerId}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

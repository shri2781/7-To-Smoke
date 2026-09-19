import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';
import { prisma } from '../src/server/db.js';

// A real Postgres database is required for this suite (it exercises the
// actual Prisma schema, unique constraints, and transactions) — skip
// cleanly rather than failing when no DATABASE_URL is configured, e.g. in
// an environment that only runs the pure engine tests.
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

d('API integration', () => {
  const app = createApp();
  const agent = request.agent(app);

  beforeAll(async () => {
    // Clean slate so this suite is repeatable against a shared dev database.
    await prisma.match.deleteMany();
    await prisma.participant.deleteMany();
    await prisma.tournament.deleteMany();
    await prisma.dancer.deleteMany();

    const res = await agent.post('/api/auth/login').send({ passcode: process.env.ADMIN_PASSCODE });
    expect(res.status).toBe(204);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects the wrong passcode and gates protected routes', async () => {
    const anon = request.agent(app);
    const bad = await anon.post('/api/auth/login').send({ passcode: 'definitely-wrong' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('UNAUTHORIZED');

    const gated = await anon.get('/api/dancers');
    expect(gated.status).toBe(401);
  });

  it('404s a typo\'d /api/* path as JSON', async () => {
    const res = await agent.get('/api/not-a-real-route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  let dancerIds: string[] = [];

  it('creates dancers', async () => {
    const names = ['Arjun', 'Meera', 'Rahul', 'Divya'];
    for (const name of names) {
      const res = await agent.post('/api/dancers').send({ name });
      expect(res.status).toBe(201);
      dancerIds.push(res.body.id);
    }
    expect(dancerIds).toHaveLength(4);
  });

  let tournamentId: string;

  it('starts a tournament with first-to-2 rules for a fast test', async () => {
    const res = await agent.post('/api/tournaments').send({
      name: 'Test Battle',
      targetScore: 2,
      maxMatches: 10,
      participants: dancerIds.map((dancerId) => ({ dancerId })),
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.phase).toBe('in_progress');
    expect(res.body.currentMatch).toMatchObject({ matchNumber: 1 });
    tournamentId = res.body.id;
  });

  it('refuses to start a second tournament while one is active', async () => {
    const res = await agent.post('/api/tournaments').send({
      name: 'Second Battle',
      targetScore: 7,
      maxMatches: 27,
      participants: dancerIds.map((dancerId) => ({ dancerId })),
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_TOURNAMENT_EXISTS');
  });

  it('records a match and advances the queue', async () => {
    const active = await agent.get('/api/tournaments/active');
    const m = active.body.currentMatch;
    const res = await agent.post(`/api/tournaments/${tournamentId}/matches`).send({
      expectedMatchNumber: m.matchNumber,
      kingParticipantId: m.kingId,
      challengerParticipantId: m.challengerId,
      winnerParticipantId: m.kingId,
    });
    expect(res.status).toBe(201);
    expect(res.body.byId[m.kingId].wins).toBe(1);
    expect(res.body.nextMatchNumber).toBe(2);
  });

  it('rejects a duplicate submission for the same match number with the current state attached', async () => {
    const state = await agent.get(`/api/tournaments/${tournamentId}`);
    const m = state.body.currentMatch;
    const dupe = await agent.post(`/api/tournaments/${tournamentId}/matches`).send({
      expectedMatchNumber: 1, // already recorded
      kingParticipantId: m.kingId,
      challengerParticipantId: m.challengerId,
      winnerParticipantId: m.kingId,
    });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.code).toBe('STALE_MATCH_NUMBER');
    expect(dupe.body.state).toBeDefined();
    expect(dupe.body.state.nextMatchNumber).toBe(2);
  });

  it('rejects two concurrent submissions for the same slot with exactly one success', async () => {
    const state = await agent.get(`/api/tournaments/${tournamentId}`);
    const m = state.body.currentMatch;
    const body = {
      expectedMatchNumber: m.matchNumber,
      kingParticipantId: m.kingId,
      challengerParticipantId: m.challengerId,
      winnerParticipantId: m.challengerId,
    };
    const [a, b] = await Promise.all([
      agent.post(`/api/tournaments/${tournamentId}/matches`).send(body),
      agent.post(`/api/tournaments/${tournamentId}/matches`).send(body),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('completes automatically once the target score is reached, and undo re-opens it', async () => {
    let state = await agent.get(`/api/tournaments/${tournamentId}`);
    while (state.body.phase === 'in_progress') {
      const m = state.body.currentMatch;
      const res = await agent.post(`/api/tournaments/${tournamentId}/matches`).send({
        expectedMatchNumber: m.matchNumber,
        kingParticipantId: m.kingId,
        challengerParticipantId: m.challengerId,
        winnerParticipantId: m.kingId,
      });
      state = { body: res.body };
    }
    expect(state.body.phase).toBe('complete');
    expect(state.body.status).toBe('completed');
    expect(state.body.endReason).toBe('target_reached');
    expect(state.body.winnerId).toBeTruthy();

    // The exact scenario that crashed the original app's equivalent code
    // path never applies here (this ended via target, not cap) — covered
    // separately below. This assertion is about undo un-completing it.
    const undo = await agent
      .delete(`/api/tournaments/${tournamentId}/matches/last`)
      .send({ expectedMatchNumber: state.body.matchesPlayed });
    expect(undo.status).toBe(200);
    expect(undo.body.status).toBe('in_progress');
    expect(undo.body.winnerParticipantId).toBeNull();
    expect(undo.body.phase).not.toBe('complete');
  });

  it('abandons and resumes', async () => {
    const abandoned = await agent.post(`/api/tournaments/${tournamentId}/abandon`);
    expect(abandoned.status).toBe(200);
    expect(abandoned.body.status).toBe('abandoned');

    const active = await agent.get('/api/tournaments/active');
    expect(active.status).toBe(204);

    const resumed = await agent.post(`/api/tournaments/${tournamentId}/resume`);
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe('in_progress');
  });

  it('declares a manual winner and it sticks as an immutable snapshot', async () => {
    const state = await agent.get(`/api/tournaments/${tournamentId}`);
    const championId = state.body.standings[0].participantId;
    const res = await agent.post(`/api/tournaments/${tournamentId}/declare-winner`).send({ participantId: championId });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.winnerParticipantId).toBe(championId);
    expect(['cap_reached_manual', 'forced']).toContain(res.body.endReason);

    // Re-fetching must return the exact same snapshot, not a fresh replay.
    const reread = await agent.get(`/api/tournaments/${tournamentId}`);
    expect(reread.body.winnerParticipantId).toBe(championId);
  });

  it('reproduces the original app\'s crash scenario end-to-end and ends cleanly', async () => {
    // Several sequential round trips to a real (non-local) Neon instance —
    // give it more room than the suite default.
    // Undo doesn't apply to a different tournament, so abandon isn't
    // needed here — the previous tournament is already 'completed'.
    const roster = await agent.get('/api/dancers');
    const ids = roster.body.map((d: { id: string }) => d.id);

    const created = await agent.post('/api/tournaments').send({
      name: 'Cap Test',
      targetScore: 50, // unreachable in 3 matches; schema caps targetScore at 50
      maxMatches: 3,
      participants: ids.map((dancerId: string) => ({ dancerId })),
    });
    expect(created.status).toBe(201);
    const capTournamentId = created.body.id;

    let state = created.body;
    for (let i = 0; i < 3; i++) {
      const m = state.currentMatch;
      const res = await agent.post(`/api/tournaments/${capTournamentId}/matches`).send({
        expectedMatchNumber: m.matchNumber,
        kingParticipantId: m.kingId,
        challengerParticipantId: m.challengerId,
        winnerParticipantId: m.kingId,
      });
      expect(res.status).toBe(201);
      state = res.body;
    }

    expect(state.phase).toBe('awaiting_manual_winner');
    expect(state.status).toBe('in_progress');
    expect(state.winnerId).toBeNull();

    const declared = await agent
      .post(`/api/tournaments/${capTournamentId}/declare-winner`)
      .send({ participantId: state.standings[0].participantId });
    expect(declared.status).toBe(200);
    expect(declared.body.endReason).toBe('cap_reached_manual');
  }, 60_000);
});

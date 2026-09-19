import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/errors.js';

export const statsRouter = Router();

/**
 * All-time cross-tournament leaderboard. Deliberately never touches the
 * rules engine — it's a plain aggregate over completed tournaments'
 * matches, grouped up from Participant rows to their Dancer. Abandoned
 * tournaments are excluded: partial king-of-the-hill results are
 * systematically biased toward whoever happened to be on a run when the
 * plug was pulled.
 */
statsRouter.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const includeRetired = req.query.includeRetired === 'true';
    const since = typeof req.query.since === 'string' ? new Date(req.query.since) : undefined;

    const tournamentFilter = {
      status: 'completed' as const,
      ...(since ? { heldOn: { gte: since } } : {}),
    };

    const [dancers, participants, matches] = await Promise.all([
      prisma.dancer.findMany({ where: includeRetired ? {} : { deletedAt: null } }),
      prisma.participant.findMany({
        where: { tournament: tournamentFilter },
        select: { id: true, dancerId: true, tournament: { select: { id: true, winnerParticipantId: true } } },
      }),
      prisma.match.findMany({
        where: { tournament: tournamentFilter },
        select: { kingParticipantId: true, challengerParticipantId: true, winnerParticipantId: true },
      }),
    ]);

    const participantToDancer = new Map(participants.map((p) => [p.id, p.dancerId]));

    type Tally = { wins: number; matchesPlayed: number; titles: number; tournaments: Set<string> };
    const byDancer = new Map<string, Tally>();
    const tally = (dancerId: string): Tally => {
      let t = byDancer.get(dancerId);
      if (!t) {
        t = { wins: 0, matchesPlayed: 0, titles: 0, tournaments: new Set() };
        byDancer.set(dancerId, t);
      }
      return t;
    };

    for (const p of participants) {
      if (!p.dancerId) continue;
      tally(p.dancerId).tournaments.add(p.tournament.id);
      if (p.tournament.winnerParticipantId === p.id) tally(p.dancerId).titles++;
    }

    for (const m of matches) {
      const kingDancer = participantToDancer.get(m.kingParticipantId);
      const challengerDancer = participantToDancer.get(m.challengerParticipantId);
      const winnerDancer = participantToDancer.get(m.winnerParticipantId);
      if (kingDancer) tally(kingDancer).matchesPlayed++;
      if (challengerDancer) tally(challengerDancer).matchesPlayed++;
      if (winnerDancer) tally(winnerDancer).wins++;
    }

    const rows = dancers.map((d) => {
      const t = byDancer.get(d.id);
      const matchesPlayed = t?.matchesPlayed ?? 0;
      const wins = t?.wins ?? 0;
      return {
        dancerId: d.id,
        name: d.name,
        crew: d.crew,
        retired: d.deletedAt !== null,
        tournamentsPlayed: t?.tournaments.size ?? 0,
        titles: t?.titles ?? 0,
        matchesPlayed,
        wins,
        losses: matchesPlayed - wins,
        winRate: matchesPlayed > 0 ? wins / matchesPlayed : 0,
      };
    });

    rows.sort((a, b) => b.titles - a.titles || b.wins - a.wins || b.winRate - a.winRate || a.name.localeCompare(b.name));

    res.json(rows);
  }),
);

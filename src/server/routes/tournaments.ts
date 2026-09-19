import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { computeState, validateSubmission } from '@shared/engine.js';
import {
  declareWinnerSchema,
  matchSubmitSchema,
  tournamentCreateSchema,
  undoMatchSchema,
} from '@shared/schemas.js';
import type { EngineState } from '@shared/types.js';
import { prisma } from '../db.js';
import { ApiError, asyncHandler, badRequest, notFound } from '../lib/errors.js';
import { requireParam } from '../lib/params.js';
import {
  buildTournamentResponse,
  rulesOf,
  toMatchInput,
  toParticipantInput,
  type TournamentWithRelations,
} from '../lib/tournamentState.js';

export const tournamentsRouter = Router();

const withRelations = { participants: true, matches: true } as const;

async function loadTournamentOr404(id: string): Promise<TournamentWithRelations> {
  const t = await prisma.tournament.findUnique({ where: { id }, include: withRelations });
  if (!t) throw notFound('Tournament not found.');
  return t;
}

// ---------------------------------------------------------------------
// GET /api/tournaments  — paginated history list
// ---------------------------------------------------------------------
tournamentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const validStatuses = ['in_progress', 'completed', 'abandoned'] as const;
    const rawStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
    const status = validStatuses.find((s) => s === rawStatus);
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    const rows = await prisma.tournament.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ heldOn: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { participants: true, _count: { select: { matches: true } } },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items = page.map((t) => {
      const winner = t.winnerParticipantId
        ? t.participants.find((p) => p.id === t.winnerParticipantId)
        : undefined;
      return {
        id: t.id,
        name: t.name,
        heldOn: t.heldOn,
        status: t.status,
        targetScore: t.targetScore,
        maxMatches: t.maxMatches,
        participantCount: t.participants.length,
        matchesPlayed: t._count.matches,
        winnerParticipantId: t.winnerParticipantId,
        winnerName: winner?.displayName ?? null,
        endReason: t.endReason,
        completedAt: t.completedAt,
        abandonedAt: t.abandonedAt,
      };
    });

    res.json({ items, nextCursor: hasMore ? page[page.length - 1]!.id : null });
  }),
);

// ---------------------------------------------------------------------
// GET /api/tournaments/active — the one in_progress tournament, if any
// ---------------------------------------------------------------------
tournamentsRouter.get(
  '/active',
  asyncHandler(async (req, res) => {
    const t = await prisma.tournament.findFirst({
      where: { status: 'in_progress' },
      include: withRelations,
    });
    if (!t) {
      res.status(204).end();
      return;
    }
    res.json(buildTournamentResponse(t));
  }),
);

// ---------------------------------------------------------------------
// POST /api/tournaments — start a new tournament
// ---------------------------------------------------------------------
tournamentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = tournamentCreateSchema.parse(req.body);

    const dancerIds = body.participants.map((p) => p.dancerId);
    if (new Set(dancerIds).size !== dancerIds.length) {
      throw badRequest('The same dancer was selected more than once.');
    }

    const activeTournament = await prisma.tournament.findFirst({ where: { status: 'in_progress' } });
    if (activeTournament) {
      throw new ApiError(409, 'ACTIVE_TOURNAMENT_EXISTS', 'A tournament is already in progress.', {
        details: { activeTournamentId: activeTournament.id },
      });
    }

    const dancers = await prisma.dancer.findMany({ where: { id: { in: dancerIds } } });
    if (dancers.length !== dancerIds.length) {
      throw badRequest('One or more selected dancers do not exist.');
    }
    const dancerById = new Map(dancers.map((d) => [d.id, d]));

    const created = await prisma.tournament.create({
      data: {
        name: body.name,
        heldOn: body.heldOn ? new Date(body.heldOn) : undefined,
        targetScore: body.targetScore,
        maxMatches: body.maxMatches,
        participants: {
          create: dancerIds.map((dancerId, seed) => {
            const d = dancerById.get(dancerId)!;
            return { dancerId, seed, displayName: d.name, displayCrew: d.crew };
          }),
        },
      },
      include: withRelations,
    });

    res.status(201).json(buildTournamentResponse(created));
  }),
);

// ---------------------------------------------------------------------
// GET /api/tournaments/:id — full state (live game screen or recap)
// ---------------------------------------------------------------------
tournamentsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const t = await loadTournamentOr404(requireParam(req, 'id'));
    res.json(buildTournamentResponse(t));
  }),
);

// ---------------------------------------------------------------------
// POST /api/tournaments/:id/matches — record a decided bout
// ---------------------------------------------------------------------
tournamentsRouter.post(
  '/:id/matches',
  asyncHandler(async (req, res) => {
    const body = matchSubmitSchema.parse(req.body);
    const t = await loadTournamentOr404(requireParam(req, 'id'));

    if (t.status === 'completed') {
      throw new ApiError(409, 'TOURNAMENT_COMPLETED', 'This tournament has already ended.', {
        state: buildTournamentResponse(t),
      });
    }
    if (t.status === 'abandoned') {
      throw new ApiError(409, 'TOURNAMENT_ABANDONED', 'This tournament was abandoned.', {
        state: buildTournamentResponse(t),
      });
    }

    const liveState = computeState(t.participants.map(toParticipantInput), t.matches.map(toMatchInput), rulesOf(t));
    const submission = {
      expectedMatchNumber: body.expectedMatchNumber,
      kingId: body.kingParticipantId,
      challengerId: body.challengerParticipantId,
      winnerId: body.winnerParticipantId,
    };
    const validation = validateSubmission(liveState, submission);
    if (!validation.ok) {
      throw new ApiError(409, validation.code, describeValidationFailure(validation.code), {
        state: buildTournamentResponse(t),
      });
    }

    let updated: TournamentWithRelations;
    try {
      updated = await prisma.$transaction(async (tx) => {
        await tx.match.create({
          data: {
            tournamentId: t.id,
            matchNumber: body.expectedMatchNumber,
            kingParticipantId: body.kingParticipantId,
            challengerParticipantId: body.challengerParticipantId,
            winnerParticipantId: body.winnerParticipantId,
          },
        });

        const newMatchInputs = [
          ...t.matches.map(toMatchInput),
          {
            matchNumber: body.expectedMatchNumber,
            kingId: body.kingParticipantId,
            challengerId: body.challengerParticipantId,
            winnerId: body.winnerParticipantId,
          },
        ];
        const newState = computeState(t.participants.map(toParticipantInput), newMatchInputs, rulesOf(t));

        if (newState.phase === 'complete') {
          await tx.tournament.update({
            where: { id: t.id },
            data: {
              status: 'completed',
              winnerParticipantId: newState.winnerId,
              endReason: 'target_reached',
              completedAt: new Date(),
              finalStandings: newState as unknown as Prisma.InputJsonValue,
            },
          });
        }

        return tx.tournament.findUniqueOrThrow({ where: { id: t.id }, include: withRelations });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Someone else's write landed first for this exact matchNumber —
        // classic double-tap / two-tabs race. Report the real current
        // state rather than a generic error.
        const fresh = await loadTournamentOr404(t.id);
        throw new ApiError(409, 'STALE_MATCH_NUMBER', 'That bout was already recorded.', {
          state: buildTournamentResponse(fresh),
        });
      }
      throw err;
    }

    res.status(201).json(buildTournamentResponse(updated));
  }),
);

// ---------------------------------------------------------------------
// DELETE /api/tournaments/:id/matches/last — undo the most recent bout
// ---------------------------------------------------------------------
tournamentsRouter.delete(
  '/:id/matches/last',
  asyncHandler(async (req, res) => {
    const body = undoMatchSchema.parse(req.body);
    const t = await loadTournamentOr404(requireParam(req, 'id'));

    if (t.matches.length === 0) {
      throw new ApiError(404, 'NO_MATCHES_TO_UNDO', 'No matches have been recorded yet.');
    }
    const last = [...t.matches].sort((a, b) => b.matchNumber - a.matchNumber)[0]!;
    if (last.matchNumber !== body.expectedMatchNumber) {
      throw new ApiError(409, 'STALE_MATCH_NUMBER', 'The most recent bout has already changed.', {
        state: buildTournamentResponse(t),
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.match.delete({ where: { tournamentId_matchNumber: { tournamentId: t.id, matchNumber: last.matchNumber } } });
      if (t.status === 'completed') {
        // Undoing the final match of a completed tournament is the most
        // likely undo in practice (a mis-tap that ended the event) — it
        // must un-complete the tournament, not just remove the match.
        await tx.tournament.update({
          where: { id: t.id },
          data: {
            status: 'in_progress',
            winnerParticipantId: null,
            endReason: null,
            completedAt: null,
            finalStandings: Prisma.JsonNull,
          },
        });
      }
      return tx.tournament.findUniqueOrThrow({ where: { id: t.id }, include: withRelations });
    });

    res.json(buildTournamentResponse(updated));
  }),
);

// ---------------------------------------------------------------------
// POST /api/tournaments/:id/declare-winner — manual completion
//
// Used both when the match cap is reached (the app never guesses a
// tiebreak winner — the admin taps the champion) and as a general
// "end it now" override at any point in an in_progress tournament.
// ---------------------------------------------------------------------
tournamentsRouter.post(
  '/:id/declare-winner',
  asyncHandler(async (req, res) => {
    const body = declareWinnerSchema.parse(req.body);
    const t = await loadTournamentOr404(requireParam(req, 'id'));

    if (t.status !== 'in_progress') {
      throw badRequest(`Cannot declare a winner for a tournament that is ${t.status}.`);
    }
    if (!t.participants.some((p) => p.id === body.participantId)) {
      throw badRequest('That participant is not in this tournament.');
    }

    const liveState = computeState(t.participants.map(toParticipantInput), t.matches.map(toMatchInput), rulesOf(t));
    const endReason = liveState.matchesPlayed >= t.maxMatches ? 'cap_reached_manual' : 'forced';
    const finalState: EngineState = {
      ...liveState,
      phase: 'complete',
      endReason,
      winnerId: body.participantId,
      currentMatch: null,
    };

    const updated = await prisma.tournament.update({
      where: { id: t.id },
      data: {
        status: 'completed',
        winnerParticipantId: body.participantId,
        endReason,
        completedAt: new Date(),
        finalStandings: finalState as unknown as Prisma.InputJsonValue,
      },
      include: withRelations,
    });

    res.json(buildTournamentResponse(updated));
  }),
);

// ---------------------------------------------------------------------
// POST /api/tournaments/:id/abandon
// ---------------------------------------------------------------------
tournamentsRouter.post(
  '/:id/abandon',
  asyncHandler(async (req, res) => {
    const t = await loadTournamentOr404(requireParam(req, 'id'));
    if (t.status !== 'in_progress') {
      throw badRequest(`Cannot abandon a tournament that is ${t.status}.`);
    }
    const updated = await prisma.tournament.update({
      where: { id: t.id },
      data: { status: 'abandoned', abandonedAt: new Date() },
      include: withRelations,
    });
    res.json(buildTournamentResponse(updated));
  }),
);

// ---------------------------------------------------------------------
// POST /api/tournaments/:id/resume
// ---------------------------------------------------------------------
tournamentsRouter.post(
  '/:id/resume',
  asyncHandler(async (req, res) => {
    const t = await loadTournamentOr404(requireParam(req, 'id'));
    if (t.status !== 'abandoned') {
      throw badRequest(`Cannot resume a tournament that is ${t.status}.`);
    }
    const activeTournament = await prisma.tournament.findFirst({ where: { status: 'in_progress' } });
    if (activeTournament) {
      throw new ApiError(409, 'ACTIVE_TOURNAMENT_EXISTS', 'A different tournament is already in progress.', {
        details: { activeTournamentId: activeTournament.id },
      });
    }
    const updated = await prisma.tournament.update({
      where: { id: t.id },
      data: { status: 'in_progress', abandonedAt: null },
      include: withRelations,
    });
    res.json(buildTournamentResponse(updated));
  }),
);

// ---------------------------------------------------------------------
// DELETE /api/tournaments/:id — hard delete (junk/test runs only)
// ---------------------------------------------------------------------
tournamentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await loadTournamentOr404(requireParam(req, 'id'));
    await prisma.tournament.delete({ where: { id: requireParam(req, 'id') } });
    res.status(204).end();
  }),
);

function describeValidationFailure(code: 'STALE_MATCH_NUMBER' | 'INVALID_PAIRING' | 'TOURNAMENT_COMPLETED'): string {
  switch (code) {
    case 'STALE_MATCH_NUMBER':
      return 'That bout was already recorded — refresh and try again.';
    case 'INVALID_PAIRING':
      return "That pairing doesn't match the current matchup.";
    case 'TOURNAMENT_COMPLETED':
      return 'This tournament has already ended.';
  }
}

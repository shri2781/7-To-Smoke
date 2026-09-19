import { Router } from 'express';
import { dancerCreateSchema, dancerUpdateSchema } from '@shared/schemas.js';
import { prisma } from '../db.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import { requireParam } from '../lib/params.js';

export const dancersRouter = Router();

dancersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const dancers = await prisma.dancer.findMany({ orderBy: { name: 'asc' } });
    res.json(dancers);
  }),
);

dancersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = dancerCreateSchema.parse(req.body);
    const dancer = await prisma.dancer.create({ data: { name: body.name, crew: body.crew ?? null } });
    res.status(201).json(dancer);
  }),
);

dancersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const body = dancerUpdateSchema.parse(req.body);
    const existing = await prisma.dancer.findUnique({ where: { id } });
    if (!existing) throw notFound('Dancer not found.');
    const dancer = await prisma.dancer.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.crew !== undefined ? { crew: body.crew ?? null } : {}),
      },
    });
    res.json(dancer);
  }),
);

// src/modules/users/users.router.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../infrastructure/database/client';
import { authenticate } from '../../shared/guards/authenticate';
import { respond, respondNoContent } from '../../shared/utils/apiResponse';
import { UnauthorizedError, NotFoundError, ConflictError } from '../../shared/errors';

const router = Router();
router.use(authenticate);

const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(80).trim().optional(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});

/** GET /api/v1/users/profile */
router.get('/profile', async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: {
      id: true,
      email: true,
      name: true,
      planTier: true,
      monthlyQuota: true,
      usedMinutes: true,
      createdAt: true,
    },
  });
  if (!user) throw new NotFoundError('User');
  respond(res, user);
});

/** PATCH /api/v1/users/profile */
router.patch('/profile', async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const data = UpdateProfileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user.sub },
    data,
    select: { id: true, email: true, name: true, planTier: true },
  });
  respond(res, user);
});

/** POST /api/v1/users/change-password */
router.post('/change-password', async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { currentPassword, newPassword } = ChangePasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) throw new NotFoundError('User');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new ConflictError('Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  respondNoContent(res);
});

/** DELETE /api/v1/users/account */
router.delete('/account', async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  await prisma.user.delete({ where: { id: req.user.sub } });
  respondNoContent(res);
});

export default router;

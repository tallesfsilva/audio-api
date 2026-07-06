// src/repositories/verificationToken.repository.ts
import { User, VerificationToken } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/client';

type TokenWithUser = VerificationToken & { user: User };

class VerificationTokenRepository {


  async findByToken(token: string): Promise<TokenWithUser | null> {
    return prisma.verificationToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.verificationToken.delete({ where: { id } });
  }

  async upsertForUser(userId: string, token: string, expiresAt: Date): Promise<void> {
    await prisma.verificationToken.upsert({
      where: { userId },
      update: { token, expiresAt },
      create: { userId, token, expiresAt },
    });
  }
}

export const verificationToken = new VerificationTokenRepository();
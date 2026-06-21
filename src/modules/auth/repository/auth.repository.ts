// src/modules/auth/repository/auth.repository.ts
import { User, RefreshToken, Prisma } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/client';

class AuthRepository {
  async findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  }

  async saveRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });
  }

  async findRefreshToken(token: string): Promise<(RefreshToken & { user: User }) | null> {
    return prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { token } });
  }

  async deleteAllUserRefreshTokens(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }



  async deleteManyRefreshToken(userId: string): Promise<void> {
     await prisma.refreshToken.deleteMany({
    where: {
      userId: userId,
      expiresAt: { lt: new Date() },
    },
  });
  }
}

export const authRepository = new AuthRepository();

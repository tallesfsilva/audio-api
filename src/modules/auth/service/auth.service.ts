// src/modules/auth/service/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '@prisma/client';
import { config } from '../../../config';
import { authRepository } from '../repository/auth.repository';
import { ConflictError, UnauthorizedError } from '../../../shared/errors';
import { SignUpDto, LoginDto } from '../dto/auth.dto';
import { JwtPayload } from '../../../shared/guards/authenticate';
import ms from 'ms'; // bundled with express

const BCRYPT_ROUNDS = 12;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface AuthResponse {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  planTier: string;
  monthlyQuota: number;
  usedMinutes: number;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    planTier: user.planTier,
    monthlyQuota: user.monthlyQuota,
    usedMinutes: user.usedMinutes,
  };
}

class AuthService {
  async signUp(dto: SignUpDto): Promise<AuthResponse> {
    const existing = await authRepository.findUserByEmail(dto.email);
    if (existing) throw new ConflictError('An account with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await authRepository.createUser({
      email: dto.email,
      name: dto.name,
      passwordHash,
    });

    const tokens = await this.generateTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await authRepository.findUserByEmail(dto.email);
    if (!user) throw new UnauthorizedError('Invalid email or password');

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) throw new UnauthorizedError('Invalid email or password');

    const tokens = await this.generateTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const record = await authRepository.findRefreshToken(refreshToken);
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Rotate refresh token (single-use)
    await authRepository.deleteRefreshToken(refreshToken);
    return this.generateTokens(record.user);
  }

  async logout(refreshToken: string): Promise<void> {
    await authRepository.deleteRefreshToken(refreshToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await authRepository.deleteAllUserRefreshTokens(userId);
  }

  private async generateTokens(user: User): Promise<AuthTokens> {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      plan: user.planTier,
    };

    const accessToken = jwt.sign(payload, config.JWT_ACCESS_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRES_IN as ms.StringValue,
    });

    const refreshToken = jwt.sign({ sub: user.id }, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN as ms.StringValue,
    });

    // Persist refresh token
    const refreshExpiresAt = new Date(
      Date.now() + ms(config.JWT_REFRESH_EXPIRES_IN as ms.StringValue),
    );
    await authRepository.saveRefreshToken(user.id, refreshToken, refreshExpiresAt);

    return {
      accessToken,
      refreshToken,
      expiresIn: ms(config.JWT_ACCESS_EXPIRES_IN as ms.StringValue) / 1000,
    };
  }
}

export const authService = new AuthService();

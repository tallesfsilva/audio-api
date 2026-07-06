// src/modules/auth/service/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { $Enums, User } from '@prisma/client';
import { config } from '../../../config';
import { authRepository } from '../repository/auth.repository';
import { verificationToken } from '../repository/verificationToken.repository';
import { AccountActivationPending, ConflictError, InvalidEmailError, InvalidTokenError, TokenExpiredError, UnauthorizedError } from '../../../shared/errors';
import { SignUpDto, LoginDto } from '../dto/auth.dto';
import { JwtPayload } from '../../../shared/guards/authenticate';
import ms from 'ms'; // bundled with express
 import crypto from 'crypto';
import { normalizeEmail, sendEmailAccountCreation, validateEmail } from '@/shared/utils/email';


const BCRYPT_ROUNDS = 12;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface AuthResponse {
  user?: PublicUser;
  tokens?: AuthTokens;
  message?: string;
  email?: string;
  isVerified?: boolean;
  success?: boolean
}

 
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  planTier: string;
  monthlyQuota: number;
  usedMinutes: number;
  role:$Enums.UserRole;
  isVerified: boolean;
}
const RESEND_MESSAGE = 'If an account exists, a verification email has been sent.'
function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    planTier: user.planTier,
    monthlyQuota: user.monthlyQuota,
    usedMinutes: user.usedMinutes,
    role: user.role,
    isVerified: user.isVerified
  };
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}


class AuthService {
  async signUp(dto: SignUpDto): Promise<AuthResponse> {
    const existing = await authRepository.findUserByEmail(dto.email);
    if (existing) throw new ConflictError('An account with this email already exists');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
  
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 1000); // 24h
    const user = await authRepository.createUser({
      email: dto.email,
      name: dto.name,
      passwordHash,
      isVerified: false,
      verificationToken: {
        create: { token, expiresAt },
      },
    });
    const tokens = await this.generateTokens(user);

    await sendEmailAccountCreation(dto.email, token)

    return {success: true,  isVerified: false, message: 'Account created. Please check your email to activate your account.', user: toPublicUser(user), tokens };
  }


    async me(email: string): Promise<AuthResponse> {
        const user = await authRepository.findUserByEmail(email);
        if (!user) throw new UnauthorizedError('Invalid email');

        const tokens = await this.generateTokens(user);
        return { user: toPublicUser(user), tokens };
  }


  
  async verifyToken(token: string): Promise<AuthResponse> {
    const record = await verificationToken.findByToken(token);

    if (!record) {
      throw new InvalidTokenError();
    }

    if (record.expiresAt < new Date()) {
        await verificationToken.delete(record.id);
        throw new TokenExpiredError();
    }
    const user = await authRepository.markVerified(record.userId);

    await verificationToken.delete(record.id );
   

    return {
      isVerified: user.isVerified,
    };
  }
 
async resendVerification(email: unknown): Promise<{ message: string }> {
    if (!validateEmail(email)) {
      
      throw new InvalidEmailError();
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await authRepository.findUserByEmail(normalizedEmail);

    if (!user || user.isVerified) {
      return { message: RESEND_MESSAGE };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await verificationToken.upsertForUser(user.id, token, expiresAt);
    await sendEmailAccountCreation(normalizedEmail, token);

    return { message: RESEND_MESSAGE };
  }
 


  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await authRepository.findUserByEmail(dto.email);
    if (!user) throw new UnauthorizedError('Invalid email or password');
    const today = new Date();
    const accountCreationDate = new Date(user.createdAt)
   if (user?.isVerified === false && isSameDay(accountCreationDate, today)) {
        throw new AccountActivationPending("Please activate your account first, check your email!");
    }

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
    await authRepository.deleteManyRefreshToken(record.userId)

   
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
      role: user.role
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

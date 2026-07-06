// src/modules/auth/controller/auth.controller.ts
import { NextFunction, Request, Response } from 'express';
import { authService } from '../service/auth.service';
import { SignUpSchema, LoginSchema, RefreshTokenSchema } from '../dto/auth.dto';
import { respond, respondCreated, respondNoContent } from '../../../shared/utils/apiResponse';
import { InvalidEmailError, InvalidTokenError, TokenExpiredError, UnauthorizedError } from '../../../shared/errors';
import { config } from '@/config';

class AuthController {
  async signUp(req: Request, res: Response): Promise<void> {
    const dto = SignUpSchema.parse(req.body);
    const result = await authService.signUp(dto);
    respondCreated(res, result);
  }

  async login(req: Request, res: Response): Promise<void> {
    const dto = LoginSchema.parse(req.body);
    const result = await authService.login(dto);
    respond(res, result);
  }
  async resendVerification (req: Request, res: Response)  {
    try {
      const { email } = req.body;
      const result = await authService.resendVerification(email);
      respond(res, result);
    } catch (err) {
          throw new InvalidEmailError();
    }
  }
  async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try{ 
      const { token } = req.query;


    if (typeof token !== 'string') {
          throw new InvalidTokenError();

        }

     await authService.verifyToken(token);
     return res.redirect(`${config.FRONT_END_URL}/login?verified=true`);
    } catch (err) {
      if (err instanceof InvalidTokenError || err instanceof TokenExpiredError) {
      return res.redirect(`${config.FRONT_END_URL}/verify-email-expired`);
    }

      next(err)
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = RefreshTokenSchema.parse(req.body);
    const tokens = await authService.refresh(refreshToken);
    respond(res, { tokens });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = RefreshTokenSchema.parse(req.body);
    await authService.logout(refreshToken);
    respondNoContent(res);
  }

  async logoutAll(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
    await authService.logoutAll(req.user.sub);
    respondNoContent(res);
  }

  async me(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError();
      const result = await authService.me(req.user.email);
    respond(res, result);
 
  }
}

export const authController = new AuthController();

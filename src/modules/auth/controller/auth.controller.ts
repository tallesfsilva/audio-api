// src/modules/auth/controller/auth.controller.ts
import { Request, Response } from 'express';
import { authService } from '../service/auth.service';
import { SignUpSchema, LoginSchema, RefreshTokenSchema } from '../dto/auth.dto';
import { respond, respondCreated, respondNoContent } from '../../../shared/utils/apiResponse';
import { UnauthorizedError } from '../../../shared/errors';

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
    respond(res, { user: req.user });
  }
}

export const authController = new AuthController();

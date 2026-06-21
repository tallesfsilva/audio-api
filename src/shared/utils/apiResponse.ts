// src/shared/utils/apiResponse.ts
import { Response } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  meta?: Record<string, unknown>;
}
 

export const respond = <T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>,
): void => {
  
  res.status(statusCode).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  } satisfies ApiResponse<T>);
};

export const respondCreated = <T>(res: Response, data: T): void =>
  respond(res, data, 201);

export const respondNoContent = (res: Response): void => {
  res.status(204).send();
};

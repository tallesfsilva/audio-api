// src/shared/errors/index.ts

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly isOperational = true,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class QuotaExceededError extends AppError {
  constructor() {
    super('Monthly transcription quota exceeded. Please upgrade your plan.', 429, 'QUOTA_EXCEEDED');
  }
}

export class UnsupportedFileError extends AppError {
  constructor(mime?: string) {
    super(
      `Unsupported file type${mime ? `: ${mime}` : ''}. Accepted: mp3, mp4, wav, m4a, ogg, flac, webm, mkv, avi, mov`,
      415,
      'UNSUPPORTED_FILE',
    );
  }
}

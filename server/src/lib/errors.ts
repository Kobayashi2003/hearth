/** The one error type; `message` is always safe to show a user. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RANGE_NOT_SATISFIABLE'
  | 'RATE_LIMITED'
  | 'ABORTED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  RATE_LIMITED: 429,
  ABORTED: 499,
  UPSTREAM_UNAVAILABLE: 502,
  INTERNAL: 500,
};

export class HearthError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'HearthError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): HearthError {
    return new HearthError('BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required'): HearthError {
    return new HearthError('UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to do that'): HearthError {
    return new HearthError('FORBIDDEN', message);
  }
  static notFound(message = 'Not found'): HearthError {
    return new HearthError('NOT_FOUND', message);
  }
  static conflict(message: string): HearthError {
    return new HearthError('CONFLICT', message);
  }
  static internal(message = 'Something went wrong'): HearthError {
    return new HearthError('INTERNAL', message);
  }
}

export function fromNodeError(error: unknown, fallbackMessage: string): HearthError {
  if (error instanceof HearthError) return error;
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case 'ENOENT':
      return HearthError.notFound('That file or folder no longer exists');
    case 'EEXIST':
      return HearthError.conflict('An item with that name already exists');
    case 'EACCES':
    case 'EPERM':
      return HearthError.forbidden('The operating system denied access to that path');
    case 'ENOTEMPTY':
      return HearthError.conflict('That folder is not empty');
    case 'EISDIR':
      return HearthError.badRequest('That path is a folder, not a file');
    case 'ENOTDIR':
      return HearthError.badRequest('That path is a file, not a folder');
    case 'ENOSPC':
      return new HearthError('INTERNAL', 'The disk is full');
    default:
      return HearthError.internal(fallbackMessage);
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof HearthError && error.code === 'ABORTED') ||
    (error as { name?: string } | undefined)?.name === 'AbortError'
  );
}

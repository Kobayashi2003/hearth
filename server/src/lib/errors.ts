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
  | 'ROOT_UNAVAILABLE'
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
  ROOT_UNAVAILABLE: 503,
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

/** Operating-system failures that mean something to the user, said in their terms. */
const NODE_ERRORS: Record<string, () => HearthError> = {
  ENOENT: () => HearthError.notFound('That file or folder no longer exists'),
  EEXIST: () => HearthError.conflict('An item with that name already exists'),
  EACCES: () => HearthError.forbidden('The operating system denied access to that path'),
  EPERM: () => HearthError.forbidden('The operating system denied access to that path'),
  ENOTEMPTY: () => HearthError.conflict('That folder is not empty'),
  EISDIR: () => HearthError.badRequest('That path is a folder, not a file'),
  ENOTDIR: () => HearthError.badRequest('That path is a file, not a folder'),
  ENOSPC: () => new HearthError('INTERNAL', 'The disk is full'),
};

export function fromNodeError(error: unknown, fallbackMessage: string): HearthError {
  if (error instanceof HearthError) return error;
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const known = code && Object.hasOwn(NODE_ERRORS, code) ? NODE_ERRORS[code] : undefined;
  return known ? known() : HearthError.internal(fallbackMessage);
}
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof HearthError && error.code === 'ABORTED') ||
    (error as { name?: string } | undefined)?.name === 'AbortError'
  );
}

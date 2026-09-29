import type { ErrorRequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, 'unauthorized', 'Authentication required');
export const forbidden = () => new HttpError(403, 'forbidden', 'Not allowed');

// Uniform { code, message } format. Never leaks internals or request data.
// Express identifies error handlers by their 4-arg arity, so `_next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }
  console.error('unhandled error:', err instanceof Error ? err.name : 'unknown');
  res.status(500).json({ code: 'internal_error', message: 'Unexpected error' });
};

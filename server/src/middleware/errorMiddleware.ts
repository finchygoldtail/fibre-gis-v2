import type { ErrorRequestHandler, RequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFoundMiddleware: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `Route not found: ${req.method} ${req.path}`));
};

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode =
    err instanceof HttpError && Number.isInteger(err.statusCode)
      ? err.statusCode
      : 500;

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    error: {
      message: err instanceof Error ? err.message : "Unexpected server error",
    },
  });
};

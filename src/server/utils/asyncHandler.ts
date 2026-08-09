import { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 does not catch rejected promises thrown by an async route
 * handler - an uncaught rejection there never sends a response (the
 * request just hangs) and, on modern Node, can crash the entire process
 * (unhandledRejection defaults to terminating the process since Node 15).
 * Wrapping every async handler in this forwards any error to the
 * centralized error-handling middleware instead, so a failure always
 * produces a proper JSON error response and never takes the whole server
 * down.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
}

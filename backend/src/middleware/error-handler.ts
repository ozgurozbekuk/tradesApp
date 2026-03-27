// Implements a reusable Express middleware for backend requests.
import { NextFunction, Request, Response } from "express";

export const notFoundHandler = (req: Request, res: Response) => {
  return res.status(404).json({
    error: "Not found",
    path: req.path
  });
};

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  void next;
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("Unhandled request error", message);

  return res.status(500).json({
    error: "Internal server error"
  });
};

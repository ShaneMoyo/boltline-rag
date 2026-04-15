import rateLimit from "express-rate-limit";

type JsonRateLimitOpts = {
  windowMs: number;
  max: number;
  message: string;
};

/** express-rate-limit with JSON `{ error }` body and shared header options. */
export function jsonRateLimit({ windowMs, max, message }: JsonRateLimitOpts) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

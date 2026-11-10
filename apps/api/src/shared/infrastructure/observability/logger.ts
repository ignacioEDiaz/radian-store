import { pino, type Logger as PinoLogger, type DestinationStream } from 'pino';

export type Logger = PinoLogger;

/** Campos que nunca deben llegar a los logs (Constitución, seguridad). */
export const REDACTED_PATHS = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'card',
  '*.card',
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: { service: 'radian-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      formatters: { level: (label) => ({ level: label }) },
    },
    destination,
  );
}

export interface ErrorMeta {
  [key: string]: unknown;
}

/** Base de todos los errores esperables. `code` es estable y forma parte del contrato HTTP. */
export abstract class AppError extends Error {
  abstract readonly kind:
    | 'domain'
    | 'validation'
    | 'not_found'
    | 'conflict'
    | 'unauthorized'
    | 'forbidden'
    | 'unavailable'
    | 'rate_limited'
    | 'payment';

  constructor(
    readonly code: string,
    message: string,
    readonly meta?: ErrorMeta,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Una regla de negocio fue violada (422). */
export class DomainError extends AppError {
  readonly kind = 'domain';
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ValidationError extends AppError {
  readonly kind = 'validation';
  constructor(
    readonly issues: ValidationIssue[],
    message = 'La solicitud contiene campos inválidos',
  ) {
    super('VALIDATION_ERROR', message);
  }
}

export class NotFoundError extends AppError {
  readonly kind = 'not_found';
}

export class ConflictError extends AppError {
  readonly kind = 'conflict';
}

export class UnauthorizedError extends AppError {
  readonly kind = 'unauthorized';
  constructor(message = 'Necesitás iniciar sesión', code = 'UNAUTHENTICATED') {
    super(code, message);
  }
}

export class ForbiddenError extends AppError {
  readonly kind = 'forbidden';
  constructor(message = 'No tenés permiso para esta operación', code = 'FORBIDDEN') {
    super(code, message);
  }
}

export class ServiceUnavailableError extends AppError {
  readonly kind = 'unavailable';
}

export class RateLimitedError extends AppError {
  readonly kind = 'rate_limited';
}

export class PaymentError extends AppError {
  readonly kind = 'payment';
}

/**
 * Unauthorized access to an existing resource is reported exactly like a
 * missing resource, so responses never reveal whether a student exists.
 */
export class NotFoundError extends Error {
  readonly kind = "NOT_FOUND" as const;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  readonly kind = "VALIDATION" as const;
  constructor(message: string, readonly issues: string[] = []) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends Error {
  readonly kind = "CONFLICT" as const;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export function isNotFound(err: unknown): err is NotFoundError {
  return err instanceof NotFoundError;
}

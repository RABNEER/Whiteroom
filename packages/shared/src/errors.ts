// ─── Error Codes ───
export const ErrorCode = {
  // Auth
  INVALID_OTP: "INVALID_OTP",
  OTP_EXPIRED: "OTP_EXPIRED",
  OTP_RATE_LIMITED: "OTP_RATE_LIMITED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",

  // Tenant
  TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
  INVITE_NOT_FOUND: "INVITE_NOT_FOUND",

  // Resources
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  LIMIT_EXCEEDED: "LIMIT_EXCEEDED",

  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",

  // Moderation / Security
  CONTENT_BLOCKED: "CONTENT_BLOCKED",

  // Server
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ─── Structured Application Error ───
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// ─── Factory Helpers ───
export const Errors = {
  unauthorized: (message = "Authentication required") =>
    new AppError(ErrorCode.UNAUTHORIZED, message, 401),

  forbidden: (message = "Insufficient permissions") =>
    new AppError(ErrorCode.FORBIDDEN, message, 403),

  notFound: (resource = "Resource") =>
    new AppError(ErrorCode.NOT_FOUND, `${resource} not found`, 404),

  validation: (message: string, details?: Record<string, unknown>) =>
    new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details),

  rateLimited: (message = "Too many requests") =>
    new AppError(ErrorCode.OTP_RATE_LIMITED, message, 429),

  limitExceeded: (message: string) =>
    new AppError(ErrorCode.LIMIT_EXCEEDED, message, 403),

  contentBlocked: (message = "Content blocked by safety guardrails", details?: Record<string, unknown>) =>
    new AppError(ErrorCode.CONTENT_BLOCKED, message, 400, details),

  internal: (message = "Something went wrong") =>
    new AppError(ErrorCode.INTERNAL_ERROR, message, 500),
} as const;

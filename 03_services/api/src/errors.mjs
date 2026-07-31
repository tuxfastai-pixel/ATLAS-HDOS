const statusByCode = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  UNAUTHORIZED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  DEPENDENCY_UNAVAILABLE: 503
};

export class ApiError extends Error {
  constructor(code, message, { details = [], cause } = {}) {
    super(message, { cause });
    this.name = "ApiError";
    this.code = code;
    this.status = statusByCode[code] || 500;
    this.details = details;
  }
}

export function errorBody(error) {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details
    }
  };
}

export function normalizeError(error) {
  if (error instanceof ApiError) return error;

  if (error?.code === "23505") {
    return new ApiError("CONFLICT", "The requested resource conflicts with existing data", { cause: error });
  }

  if (typeof error?.code === "string" && (/^08/.test(error.code) || ["57P01", "ECONNREFUSED", "ETIMEDOUT"].includes(error.code))) {
    return new ApiError("DEPENDENCY_UNAVAILABLE", "A required dependency is unavailable", { cause: error });
  }

  return new ApiError("INTERNAL_ERROR", "An unexpected error occurred", { cause: error });
}

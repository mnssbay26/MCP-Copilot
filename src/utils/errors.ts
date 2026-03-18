export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class ApsAuthRequiredError extends Error {
  constructor(message = "No cached Autodesk session is available. Start auth at /auth/url.") {
    super(message);
    this.name = "ApsAuthRequiredError";
  }
}

export class OAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthStateError";
  }
}

export class TokenRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenRefreshError";
  }
}

export class ApsHttpError extends Error {
  readonly status: number;
  readonly method: string;
  readonly url: string;
  readonly correlationId: string;
  readonly responseBody?: string;

  constructor(input: {
    message: string;
    status: number;
    method: string;
    url: string;
    correlationId: string;
    responseBody?: string;
  }) {
    super(input.message);
    this.name = "ApsHttpError";
    this.status = input.status;
    this.method = input.method;
    this.url = input.url;
    this.correlationId = input.correlationId;
    this.responseBody = input.responseBody;
  }
}

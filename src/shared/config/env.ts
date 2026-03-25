import { z } from "zod";
import { ConfigError } from "../utils/errors.js";

export const APS_REGION_VALUES = [
  "US",
  "EMEA",
  "AUS",
  "CAN",
  "DEU",
  "IND",
  "JPN",
  "GBR"
] as const;

export const RegionSchema = z.enum(APS_REGION_VALUES);

const EnvSchema = z.object({
  APS_CLIENT_ID: z.string().trim().min(1),
  APS_CLIENT_SECRET: z.string().trim().min(1),
  APS_CALLBACK_URL: z.string().trim().min(1),
  APS_SCOPES: z.string().trim().min(1),
  APS_ACCOUNT_ID: z.string().trim().min(1),
  APS_REGION: z.string().trim().optional(),
  PORT: z.string().trim().optional(),
  MCP_TRANSPORT: z.string().trim().optional()
});

export type TransportMode = "http" | "stdio";
export type RegionValue = z.infer<typeof RegionSchema>;

export interface AppConfig {
  apsClientId: string;
  apsClientSecret: string;
  apsCallbackUrl: string;
  apsScopes: string[];
  apsAccountId: string;
  apsRegion?: RegionValue;
  port: number;
  transport: TransportMode;
}

function parseScopes(rawScopes: string): string[] {
  const scopes = rawScopes
    .replace(/[+'",]/g, " ")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (scopes.length === 0) {
    throw new ConfigError("APS_SCOPES must contain at least one OAuth scope.");
  }

  return [...new Set(scopes)];
}

function parsePort(rawPort: string | undefined): number {
  if (!rawPort) {
    return 3000;
  }

  const port = Number(rawPort);
  if (!Number.isFinite(port) || port <= 0) {
    throw new ConfigError(`Invalid PORT value: '${rawPort}'.`);
  }

  return Math.trunc(port);
}

function parseTransport(rawTransport: string | undefined): TransportMode {
  if (!rawTransport) {
    return "http";
  }

  const normalized = rawTransport.toLowerCase();
  if (normalized === "http" || normalized === "stdio") {
    return normalized;
  }

  throw new ConfigError(
    `Invalid MCP_TRANSPORT value: '${rawTransport}'. Expected 'http' or 'stdio'.`
  );
}

function parseRegion(rawRegion: string | undefined): RegionValue | undefined {
  if (!rawRegion) {
    return undefined;
  }

  const normalized = rawRegion.toUpperCase();
  const parsed = RegionSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new ConfigError(
      `Invalid APS_REGION value: '${rawRegion}'. Expected one of ${APS_REGION_VALUES.join(", ")}.`
    );
  }

  return parsed.data;
}

function parseCallbackUrl(rawCallbackUrl: string): string {
  try {
    return new URL(rawCallbackUrl).toString();
  } catch {
    throw new ConfigError(`Invalid APS_CALLBACK_URL value: '${rawCallbackUrl}'.`);
  }
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new ConfigError(`Invalid environment configuration: ${issues}`);
  }

  return {
    apsClientId: parsed.data.APS_CLIENT_ID,
    apsClientSecret: parsed.data.APS_CLIENT_SECRET,
    apsCallbackUrl: parseCallbackUrl(parsed.data.APS_CALLBACK_URL),
    apsScopes: parseScopes(parsed.data.APS_SCOPES),
    apsAccountId: parsed.data.APS_ACCOUNT_ID,
    apsRegion: parseRegion(parsed.data.APS_REGION),
    port: parsePort(parsed.data.PORT),
    transport: parseTransport(parsed.data.MCP_TRANSPORT)
  };
}

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  cachedConfig ??= loadEnv();
  return cachedConfig;
}

export function resetConfigForTests(): void {
  cachedConfig = null;
}

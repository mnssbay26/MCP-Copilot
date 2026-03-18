import type { Request, Response } from "express";
import cors from "cors";
import express from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { exchangeCodeForToken, getAuthStatus, getAuthorizationUrl } from "../auth/apsAuth.js";
import { ApsAuthRequiredError, OAuthStateError, TokenRefreshError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export interface CreateHttpAppOptions {
  createServer: () => McpServer;
}

function resolveHttpStatus(error: unknown): number {
  if (error instanceof OAuthStateError) {
    return 400;
  }

  if (error instanceof ApsAuthRequiredError) {
    return 401;
  }

  if (error instanceof TokenRefreshError) {
    return 502;
  }

  return 500;
}

export function createHttpApp(options: CreateHttpAppOptions) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/auth/url", async (_req, res) => {
    try {
      const authUrl = await getAuthorizationUrl();
      res.json(authUrl);
    } catch (error) {
      logger.error("Failed to generate Autodesk auth URL.", error);
      res.status(resolveHttpStatus(error)).json({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/auth/status", async (_req, res) => {
    try {
      res.json(await getAuthStatus());
    } catch (error) {
      logger.error("Failed to read Autodesk auth status.", error);
      res.status(resolveHttpStatus(error)).json({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/auth/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;

    if (!code || !state) {
      res.status(400).json({
        error: "Missing required query parameters: code and state."
      });
      return;
    }

    try {
      const token = await exchangeCodeForToken(code, state);
      res
        .status(200)
        .type("html")
        .send(
          `<html><body style="font-family: sans-serif; padding: 32px;"><h1>Autodesk authentication completed</h1><p>The access token is cached in memory for this process.</p><p>Expires at: ${new Date(token.expiresAt).toISOString()}</p></body></html>`
        );
    } catch (error) {
      logger.error("Failed to exchange Autodesk auth code.", error);
      res.status(resolveHttpStatus(error)).json({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.all("/mcp", async (req: Request, res: Response) => {
    const server = options.createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    res.on("close", () => {
      void transport.close().catch(() => {});
      void server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error("MCP HTTP request failed.", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    }
  });

  return app;
}

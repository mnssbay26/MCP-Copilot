import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  clearCachedToken,
  getAuthorizationUrl,
  getAuthStatus
} from "../shared/auth/apsAuth.js";

const SessionInputSchema = z.object({
  sessionKey: z
    .string()
    .min(1)
    .optional()
    .describe("Optional session key used to isolate Autodesk auth per user/session.")
});

export function registerApsAuthTools(server: McpServer): void {
  server.registerTool(
    "get_autodesk_auth_url",
    {
      title: "Get Autodesk Auth URL",
      description:
        "Generate the Autodesk OAuth authorization URL for the current user/session.",
      inputSchema: SessionInputSchema.shape
    },
    async (args) => {
      try {
        const input = SessionInputSchema.parse(args);
        const result = await getAuthorizationUrl(input.sessionKey);

        return {
          structuredContent: {
            ok: true,
            action: "authenticate_with_autodesk",
            authorizationUrl: result.authorizationUrl,
            redirectUri: result.redirectUri,
            scope: result.scope,
            sessionKey: result.sessionKey,
            expiresAt: result.expiresAt
          },
          content: [
            {
              type: "text" as const,
              text:
                `Open this Autodesk login URL in your browser and complete sign-in:\n\n` +
                `${result.authorizationUrl}\n\n` +
                `After the callback finishes, come back and run get_autodesk_auth_status.`
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error)
            }
          ]
        };
      }
    }
  );

  server.registerTool(
    "get_autodesk_auth_status",
    {
      title: "Get Autodesk Auth Status",
      description:
        "Check whether the current user/session already has a valid Autodesk token cached.",
      inputSchema: SessionInputSchema.shape
    },
    async (args) => {
      try {
        const input = SessionInputSchema.parse(args);
        const status = await getAuthStatus(input.sessionKey);

        return {
          structuredContent: {
            ok: true,
            ...status
          },
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(status, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error)
            }
          ]
        };
      }
    }
  );

  server.registerTool(
    "disconnect_autodesk",
    {
      title: "Disconnect Autodesk",
      description:
        "Clear the cached Autodesk token for the current user/session.",
      inputSchema: SessionInputSchema.shape
    },
    async (args) => {
      try {
        const input = SessionInputSchema.parse(args);
        await clearCachedToken(input.sessionKey);

        return {
          structuredContent: {
            ok: true,
            sessionKey: input.sessionKey ?? "default",
            disconnected: true
          },
          content: [
            {
              type: "text" as const,
              text: "Autodesk token cleared successfully."
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error)
            }
          ]
        };
      }
    }
  );
}
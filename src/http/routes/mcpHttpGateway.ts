import express, { Router } from "express";
import { mcpManifest } from "../../mcp/manifest.js";
import { getAuthStatus } from "../../shared/auth/apsAuth.js";
import { getProjects } from "../../mcp-acc-account-admin/service.js";

const router = Router();
router.use(express.json());

/**
 * Utilidades JSON-RPC 2.0
 */
type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
};

function ok(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown
) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

/**
 * MCP HTTP JSON‑RPC gateway en "/"
 * Copilot Studio habla JSON‑RPC 2.0:
 *   { "jsonrpc":"2.0", "id":"...", "method":"initialize", "params":{...} }
 * y espera respuestas con envelope JSON‑RPC.
 */
router.post("/", async (req, res) => {
  const body: JsonRpcRequest | JsonRpcRequest[] = req.body;

  // Soporta batch requests opcionalmente
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map(handleOne));
    return res.json(results);
  }

  const result = await handleOne(body);
  return res.json(result);
});

/**
 * Handler de una sola llamada JSON‑RPC
 */
async function handleOne(req: JsonRpcRequest) {
  try {
    // Validación mínima de JSON‑RPC 2.0
    if (!req || typeof req !== "object" || (req.jsonrpc && req.jsonrpc !== "2.0")) {
      return err(req?.id, -32600, "Invalid Request");
    }
    const method = req.method;
    const params = req.params ?? {};

    if (!method || typeof method !== "string") {
      return err(req.id, -32600, "Invalid Request", { reason: "Missing 'method' string" });
    }

    switch (method) {
      /**
       * 1) Handshake requerido
       */
      case "initialize": {
        return ok(req.id, {
          protocolVersion: "1.0.0",
          capabilities: {
            tools: { list: true, execute: true },
            resources: { list: true }
          },
          serverInfo: { name: "mcp-copilot-acc", version: "1.0.0" }
        });
      }

      /**
       * 2) Lista de tools publicadas por tu MCP
       */
      case "tools/list": {
        return ok(req.id, { tools: mcpManifest.tools ?? [] });
      }

      /**
       * 3) Lista de resources (si los publicas)
       */
      case "resources/list": {
        return ok(req.id, { resources: mcpManifest.resources ?? [] });
      }

      /**
       * 4) Ejecución de tools
       *    params: { name: string, arguments?: any }
       */
      case "tools/execute":
      case "tools/call": {
        const name: string | undefined = params?.name;
        const args: any = params?.arguments ?? params?.args ?? {};

        if (!name) {
          return err(req.id, -32602, "Invalid params", { reason: "Missing params.name" });
        }

        switch (name) {
          case "iniciar_autodesk_auth": {
            // TODO: conectar con tu flujo real (p. ej., servicio que expone /auth/start)
            return err(req.id, -32001, "Tool 'iniciar_autodesk_auth' not implemented yet");
          }

          case "estado_autenticacion": {
            const status = await getAuthStatus();
            return ok(req.id, status);
          }

          case "listar_proyectos": {
            const limit = typeof args.limit === "number" ? args.limit : 50;
            const offset = typeof args.offset === "number" ? args.offset : 0;
            const result = await getProjects({ limit, offset });
            return ok(req.id, result);
          }

          default:
            return err(req.id, -32601, `Method not found: ${name}`);
        }
      }

      default:
        // Método MCP desconocido
        return err(req.id, -32601, `Method not found: ${method}`);
    }
  } catch (e: any) {
    return err(req?.id, -32000, e?.message ?? "Internal MCP gateway error");
  }
}

export default router;
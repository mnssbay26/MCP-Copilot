import express, { Router } from "express";
import { mcpManifest } from "../../mcp/manifest.js";
import { getAuthStatus } from "../../shared/auth/apsAuth.js";
import { getProjects } from "../../mcp-acc-account-admin/service.js";

const router = Router();

// Para parsear JSON en este router sin afectar tu configuración global
router.use(express.json());

/**
 * MCP HTTP JSON-RPC gateway en "/"
 * Copilot Studio llama SIEMPRE:
 *
 * 1) POST / { "method": "initialize", ... }
 * 2) POST / { "method": "tools/list" }
 * 3) POST / { "method": "resources/list" }
 * 4) POST / { "method": "tools/execute", "params": {...}}
 */
router.post("/", async (req, res) => {
  const { method, params } = req.body ?? {};

  try {
    // 🔹 1) HANDSHAKE OBLIGATORIO: initialize
    if (method === "initialize") {
      return res.json({
        protocolVersion: "1.0.0",
        capabilities: {
          tools: { list: true, execute: true },
          resources: { list: true }
        },
        serverInfo: {
          name: "mcp-copilot-acc",
          version: "1.0.0"
        }
      });
    }

    // 🔹 2) LISTA DE TOOLS DEL MCP
    if (method === "tools/list") {
      return res.json({ tools: mcpManifest.tools ?? [] });
    }

    // 🔹 3) LISTA DE RESOURCES (por ahora vacío)
    if (method === "resources/list") {
      return res.json({ resources: mcpManifest.resources ?? [] });
    }

    // 🔹 4) EJECUCIÓN DE TOOLS
    if (method === "tools/execute" || method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments ?? params?.args ?? {};

      if (!name) {
        return res.status(400).json({ error: "Missing params.name" });
      }

      switch (name) {
        case "iniciar_autodesk_auth": {
          // TODO: conecta con tu flujo real (/auth/start)
          return res.status(501).json({
            error: "Tool 'iniciar_autodesk_auth' aún no está implementada en el gateway."
          });
        }

        case "estado_autenticacion": {
          const status = await getAuthStatus();
          return res.json(status);
        }

        case "listar_proyectos": {
          const limit = typeof args.limit === "number" ? args.limit : 50;
          const offset = typeof args.offset === "number" ? args.offset : 0;
          const result = await getProjects({ limit, offset });
          return res.json(result);
        }

        default:
          return res.status(400).json({ error: `Tool desconocida: ${name}` });
      }
    }

    // 🔹 5) MÉTODO DESCONOCIDO (default)
    return res.status(400).json({ error: `Método no soportado: ${method}` });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "MCP gateway error" });
  }
});

export default router;
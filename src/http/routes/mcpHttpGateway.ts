import express, { Router } from "express";
import { mcpManifest } from "../../mcp/manifest.js";
// Reusa tus servicios reales:
import { getAuthStatus } from "../../shared/auth/apsAuth.js";
import { getProjects } from "../../mcp-acc-account-admin/service.js";

const router = Router();

// Este router maneja JSON localmente para no tocar config global
router.use(express.json());

/**
 * MCP HTTP JSON-RPC gateway en "/"
 * Copilot Studio hace POST / con un body tipo { "method": "...", "params": {...} }
 * Soportamos:
 *   - tools/list
 *   - resources/list
 *   - tools/call | tools/execute (equivalentes)
 */
router.post("/", async (req, res) => {
  const { method, params } = req.body ?? {};

  try {
    switch (method) {
      case "tools/list": {
        // Respuesta esperada: { tools: [...] }
        return res.json({ tools: mcpManifest.tools ?? [] });
      }

      case "resources/list": {
        // Si en el futuro publicas resources dinámicos, devuélvelos aquí
        return res.json({ resources: mcpManifest.resources ?? [] });
      }

      case "tools/execute":
      case "tools/call": {
        const name: string | undefined = params?.name;
        const args: any = params?.arguments ?? params?.args ?? {};

        if (!name) {
          return res.status(400).json({ error: "Missing params.name" });
        }

        // Ejecutamos por nombre (mapea a tus servicios reales)
        switch (name) {
          case "iniciar_autodesk_auth": {
            // TODO: cablear a tu flujo real de inicio OAuth (p. ej. /auth/start)
            // return res.json(await iniciarAuth());
            return res
              .status(501)
              .json({ error: "Tool 'iniciar_autodesk_auth' aún no implementada en gateway." });
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

      default: {
        return res.status(400).json({ error: `Método no soportado: ${method}` });
      }
    }
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "MCP gateway error" });
  }
});

export default router;
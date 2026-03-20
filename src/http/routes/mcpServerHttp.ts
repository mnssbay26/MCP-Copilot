import express, { Router } from "express";
import { mcpManifest } from "../../mcp/manifest.js";

// Puedes reutilizar tus servicios reales:
import { getAuthStatus } from "../../shared/auth/apsAuth.js";
import { getProjects } from "../../mcp-acc-account-admin/service.js";

const router = Router();

// Este router maneja JSON por su cuenta para no exigir cambios globales
router.use(express.json());

/**
 * Lista de herramientas MCP
 * Respuesta esperada por Copilot Studio: { tools: [...] }
 */
router.post("/mcp/tools/list", (_req, res) => {
  try {
    res.json({ tools: mcpManifest.tools ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "tools/list failed" });
  }
});

/**
 * Lista de resources MCP (si los usas). Por ahora publicamos lo que haya en el manifest.
 * Respuesta esperada: { resources: [...] }
 */
router.post("/mcp/resources/list", (_req, res) => {
  try {
    res.json({ resources: mcpManifest.resources ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "resources/list failed" });
  }
});

/**
 * Ejecución de herramientas por nombre
 * Entrada típica: { name: "listar_proyectos", arguments: { ... } }
 * Respuesta: lo que tu tool devuelva (JSON)
 */
router.post("/mcp/tools/execute", async (req, res) => {
  const { name, arguments: args } = req.body ?? {};

  try {
    switch (name) {
      case "iniciar_autodesk_auth": {
        // 🔧 Integra aquí tu flujo real de inicio OAuth si ya lo tienes como servicio/endpoint.
        // Por ahora retornamos 501 para que veas la invocación funcionando.
        return res
          .status(501)
          .json({ error: "Tool 'iniciar_autodesk_auth' aún no cableada en el servidor." });
      }

      case "estado_autenticacion": {
        // Si tu auth es por proceso y no por sessionId, puedes ignorar args?.sessionId aquí
        const status = await getAuthStatus();
        return res.json(status);
      }

      case "listar_proyectos": {
        // Usa tu servicio real. Ajusta limit/offset como gustes o toma de args
        const limit = typeof args?.limit === "number" ? args.limit : 50;
        const offset = typeof args?.offset === "number" ? args.offset : 0;
        const result = await getProjects({ limit, offset });
        return res.json(result);
      }

      default:
        return res.status(400).json({ error: `Tool desconocida: ${name}` });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "tool execute failed" });
  }
});

export default router;
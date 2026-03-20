// src/http/routes/wellKnown.ts
import { Router } from "express";
import { mcpManifest } from "../../mcp/manifest.js";

const router = Router();

// Manifest MCP: Copilot Studio leerá esto para poblar Tools/Resources
router.get("/.well-known/mcp.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=60");
  res.json(mcpManifest);
});

export default router;
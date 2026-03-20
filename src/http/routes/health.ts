// src/http/routes/health.ts
import { Router } from "express";

const router = Router();

/**
 * Health check: siempre devuelve 200
 * Si quieres, aquí luego puedes validar dependencias (APS, DB, etc.)
 */
router.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

export default router;
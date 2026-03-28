import { Router } from "express";
import { getArtifact } from "../../shared/artifacts/store.js";

const router = Router();

router.get("/artifacts/:artifactId", (req, res) => {
  const artifactId =
    typeof req.params.artifactId === "string" ? req.params.artifactId.trim() : "";

  if (!artifactId) {
    res.status(400).json({
      error: "Artifact id is required."
    });
    return;
  }

  const artifact = getArtifact(artifactId);
  if (!artifact) {
    res.status(404).json({
      error: "Artifact not found or expired."
    });
    return;
  }

  res.setHeader("Content-Type", artifact.contentType);
  res.setHeader("Content-Length", String(artifact.content.length));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${artifact.fileName.replace(/"/g, "")}"`
  );
  res.send(artifact.content);
});

export default router;

// src/mcp/manifest.ts
export type McpTool = {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  };
  
  export type McpManifest = {
    version: string;
    name: string;
    description: string;
    tools: McpTool[];
    resources: any[];
  };

  //comment
  
  export const mcpManifest: McpManifest = {
    version: "1.0.0",
    name: "mcp-copilot-acc",
    description: "Herramientas MCP para interactuar con Autodesk ACC usando APS OAuth",
    tools: [
      {
        name: "iniciar_autodesk_auth",
        description: "Inicia el flujo OAuth de Autodesk y devuelve { url, sessionId }",
        input_schema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "estado_autenticacion",
        description: "Devuelve el estado de autenticación del usuario",
        input_schema: {
          type: "object",
          properties: {
            sessionId: { type: "string" }
          },
          required: ["sessionId"]
        }
      },
      {
        name: "listar_proyectos",
        description: "Lista proyectos visibles en Autodesk Construction Cloud",
        input_schema: {
          type: "object",
          properties: {
            sessionId: { type: "string" }
          },
          required: ["sessionId"]
        }
      }
    ],
    resources: []
  };
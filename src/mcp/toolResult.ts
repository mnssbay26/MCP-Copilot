export interface ToolWarning {
  code: string;
  message: string;
  [key: string]: unknown;
}

export interface ListToolPagination {
  limit: number;
  offset: number;
  returned: number;
  totalResults?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
  [key: string]: unknown;
}

export interface ListToolMeta {
  tool: string;
  source: string;
  generatedAt: string;
  accountId?: string;
  projectId?: string;
  [key: string]: unknown;
}

export interface ListToolResult<TItem> {
  results: TItem[];
  pagination: ListToolPagination;
  meta: ListToolMeta;
  warnings: ToolWarning[];
  [key: string]: unknown;
}

export function toToolResult<TItem>(payload: ListToolResult<TItem>) {
  return {
    structuredContent: payload,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

export function toToolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: message
      }
    ]
  };
}

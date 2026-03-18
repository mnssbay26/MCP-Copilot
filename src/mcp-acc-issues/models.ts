import type { ApsListEnvelope } from "../shared/aps/models.js";

export interface RawIssue extends Record<string, unknown> {
  id?: string;
  displayId?: string | number;
  title?: string;
  status?: string;
  assignedTo?: string | Record<string, unknown>;
  dueDate?: string;
  createdAt?: string;
}

export interface IssueSummary {
  id: string;
  displayId?: string;
  title?: string;
  status?: string;
  assignedTo?: string;
  dueDate?: string;
  createdAt?: string;
}

export type IssuesResponse = ApsListEnvelope<RawIssue>;

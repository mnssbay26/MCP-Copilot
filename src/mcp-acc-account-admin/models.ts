import type { ApsListEnvelope } from "../shared/aps/models.js";

export interface RawAccProject extends Record<string, unknown> {
  id?: string;
  projectId?: string;
  name?: string;
  title?: string;
  status?: string;
  platform?: string;
  projectType?: string;
}

export interface RawAccProjectUser extends Record<string, unknown> {
  id?: string;
  autodeskId?: string;
  name?: string;
  displayName?: string;
  email?: string;
  status?: string;
  companyId?: string;
  companyName?: string;
  accessLevels?: string[] | string;
}

export interface ProjectSummary {
  id: string;
  name?: string;
  status?: string;
  platform?: string;
  type?: string;
}

export interface ProjectUserSummary {
  id: string;
  name?: string;
  email?: string;
  status?: string;
  companyId?: string;
  companyName?: string;
  accessLevels?: string[];
}

export type AccProjectsResponse = ApsListEnvelope<RawAccProject>;
export type AccProjectUsersResponse = ApsListEnvelope<RawAccProjectUser>;

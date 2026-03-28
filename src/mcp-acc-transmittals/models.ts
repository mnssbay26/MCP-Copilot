import type { ApsListEnvelope } from "../shared/aps/models.js";
import type {
  CollectionRetrievalMeta,
  SummaryCount
} from "../shared/mcp/reporting.js";
import type { ToolWarning } from "../shared/mcp/toolResult.js";

export interface RawTransmittalRecord extends Record<string, unknown> {
  id?: string;
  title?: string;
  status?: string;
  sequenceId?: string | number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RawTransmittalRecipientsResponse {
  recipients?: Record<string, unknown>[];
  externalMembers?: Record<string, unknown>[];
}

export interface TransmittalsFilters {
  statuses?: string[];
  senderNames?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export interface TransmittalLookupItem {
  id: string;
  sequenceId?: string;
  title?: string;
  status: string;
  sentBy?: string;
  createdAt?: string;
  updatedAt?: string;
  documentsCount?: number;
}

export interface TransmittalRecipient {
  name: string;
  company?: string;
  role?: string;
  recipientType: "internal" | "external";
}

export interface TransmittalFolderItem {
  id: string;
  name: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface TransmittalDocumentItem {
  id: string;
  name: string;
  version?: string;
  updatedAt?: string;
  updatedBy?: string;
  fileType?: string;
  accUrl?: string;
}

export interface TransmittalsSummaryResult {
  summary: {
    totalTransmittals: number;
    statusesTracked: number;
    senderGroupsTracked: number;
    documentsReferenced: number;
  };
  results: {
    byStatus: SummaryCount[];
    bySender: SummaryCount[];
  };
  retrieval: CollectionRetrievalMeta;
  filtersApplied: TransmittalsFilters;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface FindTransmittalsResult {
  summary: {
    totalMatches: number;
    returnedRows: number;
    statusesTracked: number;
    senderGroupsTracked: number;
  };
  results: TransmittalLookupItem[];
  retrieval: CollectionRetrievalMeta;
  filtersApplied: {
    query?: string;
    statuses?: string[];
    senderNames?: string[];
    dateFrom?: string;
    dateTo?: string;
  };
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
  };
  warnings: ToolWarning[];
}

export interface TransmittalDetailsResult {
  summary: {
    found: boolean;
    recipientCount: number;
    folderCount: number;
    documentCount: number;
  };
  result: {
    id: string;
    sequenceId?: string;
    title?: string;
    status: string;
    sentBy?: string;
    createdAt?: string;
    updatedAt?: string;
    message?: string;
    recipients: TransmittalRecipient[];
    folders: TransmittalFolderItem[];
    documents: TransmittalDocumentItem[];
  } | null;
  meta: {
    tool: string;
    source: string;
    generatedAt: string;
    projectId: string;
    transmittalId: string;
  };
  warnings: ToolWarning[];
}

export type TransmittalsResponse = ApsListEnvelope<RawTransmittalRecord>;

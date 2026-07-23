import { randomUUID } from "crypto";
import {
  canDeleteDocuments,
  canDownloadDocuments,
  canUploadDocuments,
  canViewDocuments,
  type AuthSession
} from "./auth-types";
import { readAppSetting, writeAppSetting } from "./app-settings";

export const DOCUMENT_CATEGORIES = ["atas", "faturas", "contratos", "recibos", "licencas", "imagens", "outro"] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export type ArchivedDocument = {
  id: string;
  title: string;
  category: DocumentCategory;
  description: string;
  tags: string[];
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

export type ArchivedDocumentSummary = Omit<ArchivedDocument, "dataUrl">;

export type ArchivedDocumentInput = {
  title?: unknown;
  category?: unknown;
  description?: unknown;
  tags?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  size?: unknown;
  dataUrl?: unknown;
};

export class DocumentArchiveError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

const DOCUMENT_ARCHIVE_KEY = "document_archive";
const MAX_DOCUMENTS = 220;
export const MAX_DOCUMENT_BYTES = 4_000_000;
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_DOCUMENT_BYTES * 1.45);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);

const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "txt", "csv", "doc", "docx", "xls", "xlsx", "ppt", "pptx"]);

function cleanText(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function safeDate(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeCategory(value: unknown): DocumentCategory {
  return typeof value === "string" && DOCUMENT_CATEGORIES.includes(value as DocumentCategory)
    ? (value as DocumentCategory)
    : "outro";
}

function normalizeTags(value: unknown) {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const seen = new Set<string>();
  return rawTags
    .map((tag) => cleanText(tag, 28))
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

function extensionFromFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  return extension;
}

function mimeFromDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
  return match?.[1]?.toLowerCase() ?? "";
}

function dataUrlByteSize(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return 0;
  const base64 = dataUrl.slice(commaIndex + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function isAllowedDocument(fileName: string, mimeType: string) {
  return ALLOWED_MIME_TYPES.has(mimeType) || ALLOWED_EXTENSIONS.has(extensionFromFileName(fileName));
}

function normalizeDocument(value: unknown): ArchivedDocument | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ArchivedDocument>;
  const dataUrl = cleanText(source.dataUrl, MAX_DATA_URL_LENGTH);
  const fileName = cleanText(source.fileName, 160);
  if (!dataUrl.startsWith("data:") || !fileName) return null;

  const now = new Date().toISOString();
  const mimeType = cleanText(source.mimeType, 120) || mimeFromDataUrl(dataUrl) || "application/octet-stream";
  const title = cleanText(source.title, 96) || fileName;
  const size = typeof source.size === "number" && Number.isFinite(source.size) ? source.size : dataUrlByteSize(dataUrl);

  return {
    id: typeof source.id === "string" && source.id ? source.id : randomUUID(),
    title,
    category: normalizeCategory(source.category),
    description: cleanText(source.description, 800),
    tags: normalizeTags(source.tags),
    fileName,
    mimeType,
    size,
    dataUrl,
    createdAt: safeDate(source.createdAt, now),
    createdBy: cleanText(source.createdBy, 80) || "Sistema",
    updatedAt: safeDate(source.updatedAt, now)
  };
}

function sortDocuments(documents: ArchivedDocument[]) {
  return documents.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function toSummary(document: ArchivedDocument): ArchivedDocumentSummary {
  const { dataUrl: _dataUrl, ...summary } = document;
  return summary;
}

async function writeDocuments(documents: ArchivedDocument[]) {
  await writeAppSetting(DOCUMENT_ARCHIVE_KEY, sortDocuments(documents).slice(0, MAX_DOCUMENTS));
}

export async function getArchivedDocuments() {
  const setting = await readAppSetting<unknown>(DOCUMENT_ARCHIVE_KEY);
  if (!Array.isArray(setting)) return [];
  return sortDocuments(setting.map(normalizeDocument).filter((document): document is ArchivedDocument => Boolean(document)));
}

export async function getArchivedDocumentSummaries(session: AuthSession) {
  if (!canViewDocuments(session)) {
    throw new DocumentArchiveError("Sem permissão para consultar o arquivo de documentos.", 403);
  }

  const documents = await getArchivedDocuments();
  return documents.map(toSummary);
}

export async function createArchivedDocument(session: AuthSession, input: ArchivedDocumentInput) {
  if (!canUploadDocuments(session)) {
    throw new DocumentArchiveError("Sem permissão para carregar documentos.", 403);
  }

  const rawDataUrl = typeof input.dataUrl === "string" ? input.dataUrl.trim() : "";
  if (rawDataUrl.length > MAX_DATA_URL_LENGTH) throw new DocumentArchiveError("O ficheiro não pode ter mais de 4 MB.", 400);
  const dataUrl = rawDataUrl;
  const fileName = cleanText(input.fileName, 160);
  const mimeType = cleanText(input.mimeType, 120) || mimeFromDataUrl(dataUrl) || "application/octet-stream";
  const size = typeof input.size === "number" && Number.isFinite(input.size) ? input.size : dataUrlByteSize(dataUrl);
  const title = cleanText(input.title, 96) || fileName;

  if (!title) throw new DocumentArchiveError("Indica o nome do documento.", 400);
  if (!fileName || !dataUrl.startsWith("data:")) throw new DocumentArchiveError("Escolhe um ficheiro válido.", 400);
  if (!isAllowedDocument(fileName, mimeType)) throw new DocumentArchiveError("Tipo de ficheiro não permitido.", 400);
  if (size <= 0) throw new DocumentArchiveError("O ficheiro está vazio.", 400);
  if (size > MAX_DOCUMENT_BYTES) throw new DocumentArchiveError("O ficheiro não pode ter mais de 4 MB.", 400);

  const now = new Date().toISOString();
  const document: ArchivedDocument = {
    id: randomUUID(),
    title,
    category: normalizeCategory(input.category),
    description: cleanText(input.description, 800),
    tags: normalizeTags(input.tags),
    fileName,
    mimeType,
    size,
    dataUrl,
    createdAt: now,
    createdBy: session.username,
    updatedAt: now
  };

  const documents = await getArchivedDocuments();
  await writeDocuments([document, ...documents]);
  return toSummary(document);
}

export async function deleteArchivedDocument(session: AuthSession, id: string) {
  if (!canDeleteDocuments(session)) {
    throw new DocumentArchiveError("Sem permissão para apagar documentos.", 403);
  }

  const documents = await getArchivedDocuments();
  const document = documents.find((candidate) => candidate.id === id);
  if (!document) throw new DocumentArchiveError("Documento não encontrado.", 404);

  await writeDocuments(documents.filter((candidate) => candidate.id !== id));
  return toSummary(document);
}

export async function getArchivedDocumentFile(session: AuthSession, id: string) {
  if (!canDownloadDocuments(session)) {
    throw new DocumentArchiveError("Sem permissão para descarregar documentos.", 403);
  }

  const documents = await getArchivedDocuments();
  const document = documents.find((candidate) => candidate.id === id);
  if (!document) throw new DocumentArchiveError("Documento não encontrado.", 404);
  return document;
}

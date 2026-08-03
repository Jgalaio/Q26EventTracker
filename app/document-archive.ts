import { randomUUID } from "crypto";
import {
  canDeleteDocuments,
  canDownloadDocuments,
  canUploadDocuments,
  canViewDocuments,
  type AuthSession
} from "./auth-types";
import { deleteAppSetting, readAppSetting, writeAppSetting } from "./app-settings";

export const DOCUMENT_CATEGORIES = ["atas", "faturas", "contratos", "recibos", "licencas", "imagens", "outro"] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export type ArchivedDocument = {
  id: string;
  title: string;
  category: DocumentCategory;
  description: string;
  tags: string[];
  eventId: string | null;
  eventSlug: string | null;
  eventName: string | null;
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
  eventId?: unknown;
  eventSlug?: unknown;
  eventName?: unknown;
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
const DOCUMENT_ARCHIVE_INDEX_KEY = "document_archive_index";
const DOCUMENT_FILE_KEY_PREFIX = "document_archive_file:";
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
  const category = normalizeCategory(source.category);
  const size = typeof source.size === "number" && Number.isFinite(source.size) ? source.size : dataUrlByteSize(dataUrl);

  return {
    id: typeof source.id === "string" && source.id ? source.id : randomUUID(),
    title,
    category,
    description: cleanText(source.description, 800),
    tags: normalizeTags(source.tags),
    eventId: category === "faturas" ? cleanText(source.eventId, 80) || null : null,
    eventSlug: category === "faturas" ? cleanText(source.eventSlug, 96) || null : null,
    eventName: category === "faturas" ? cleanText(source.eventName, 140) || null : null,
    fileName,
    mimeType,
    size,
    dataUrl,
    createdAt: safeDate(source.createdAt, now),
    createdBy: cleanText(source.createdBy, 80) || "Sistema",
    updatedAt: safeDate(source.updatedAt, now)
  };
}

function sortByUpdatedAt<T extends { updatedAt: string }>(documents: T[]) {
  return [...documents].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function toSummary(document: ArchivedDocument): ArchivedDocumentSummary {
  const { dataUrl: _dataUrl, ...summary } = document;
  return summary;
}

function normalizeDocumentSummary(value: unknown): ArchivedDocumentSummary | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ArchivedDocumentSummary>;
  const id = cleanText(source.id, 80);
  const fileName = cleanText(source.fileName, 160);
  if (!id || !fileName) return null;

  const now = new Date().toISOString();
  const category = normalizeCategory(source.category);

  return {
    id,
    title: cleanText(source.title, 96) || fileName,
    category,
    description: cleanText(source.description, 800),
    tags: normalizeTags(source.tags),
    eventId: category === "faturas" ? cleanText(source.eventId, 80) || null : null,
    eventSlug: category === "faturas" ? cleanText(source.eventSlug, 96) || null : null,
    eventName: category === "faturas" ? cleanText(source.eventName, 140) || null : null,
    fileName,
    mimeType: cleanText(source.mimeType, 120) || "application/octet-stream",
    size: typeof source.size === "number" && Number.isFinite(source.size) ? source.size : 0,
    createdAt: safeDate(source.createdAt, now),
    createdBy: cleanText(source.createdBy, 80) || "Sistema",
    updatedAt: safeDate(source.updatedAt, now)
  };
}

function documentFileKey(id: string) {
  return `${DOCUMENT_FILE_KEY_PREFIX}${id}`;
}

async function readLegacyDocuments() {
  const setting = await readAppSetting<unknown>(DOCUMENT_ARCHIVE_KEY);
  if (!Array.isArray(setting)) return [];
  return sortByUpdatedAt(setting.map(normalizeDocument).filter((document): document is ArchivedDocument => Boolean(document)));
}

async function readDocumentIndex() {
  const setting = await readAppSetting<unknown>(DOCUMENT_ARCHIVE_INDEX_KEY);
  if (!Array.isArray(setting)) return null;
  return sortByUpdatedAt(
    setting.map(normalizeDocumentSummary).filter((document): document is ArchivedDocumentSummary => Boolean(document))
  );
}

async function writeDocumentIndex(documents: ArchivedDocumentSummary[]) {
  await writeAppSetting(DOCUMENT_ARCHIVE_INDEX_KEY, sortByUpdatedAt(documents).slice(0, MAX_DOCUMENTS));
}

async function writeDocumentFile(document: ArchivedDocument) {
  await writeAppSetting(documentFileKey(document.id), document);
}

async function readDocumentFile(id: string) {
  const setting = await readAppSetting<unknown>(documentFileKey(id));
  return normalizeDocument(setting);
}

async function getDocumentSummaries() {
  const indexedDocuments = await readDocumentIndex();
  if (indexedDocuments) return indexedDocuments;

  const legacyDocuments = await readLegacyDocuments();
  const summaries = legacyDocuments.map(toSummary);
  if (summaries.length) {
    await writeDocumentIndex(summaries);
  }

  return summaries;
}

export async function getArchivedDocuments() {
  const summaries = await getDocumentSummaries();
  if (!summaries.length) return [];

  const storedDocuments = await Promise.all(summaries.map((document) => readDocumentFile(document.id)));
  const legacyDocuments = storedDocuments.some((document) => !document) ? await readLegacyDocuments() : [];
  const legacyById = new Map(legacyDocuments.map((document) => [document.id, document]));

  return sortByUpdatedAt(
    summaries
      .map((summary, index) => storedDocuments[index] ?? legacyById.get(summary.id) ?? null)
      .filter((document): document is ArchivedDocument => Boolean(document))
  );
}

export async function getArchivedDocumentSummaries(session: AuthSession) {
  if (!canViewDocuments(session)) {
    throw new DocumentArchiveError("Sem permissão para consultar o arquivo de documentos.", 403);
  }

  return getDocumentSummaries();
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
  const category = normalizeCategory(input.category);

  if (!title) throw new DocumentArchiveError("Indica o nome do documento.", 400);
  if (!fileName || !dataUrl.startsWith("data:")) throw new DocumentArchiveError("Escolhe um ficheiro válido.", 400);
  if (!isAllowedDocument(fileName, mimeType)) throw new DocumentArchiveError("Tipo de ficheiro não permitido.", 400);
  if (size <= 0) throw new DocumentArchiveError("O ficheiro está vazio.", 400);
  if (size > MAX_DOCUMENT_BYTES) throw new DocumentArchiveError("O ficheiro não pode ter mais de 4 MB.", 400);

  const now = new Date().toISOString();
  const document: ArchivedDocument = {
    id: randomUUID(),
    title,
    category,
    description: cleanText(input.description, 800),
    tags: normalizeTags(input.tags),
    eventId: category === "faturas" ? cleanText(input.eventId, 80) || null : null,
    eventSlug: category === "faturas" ? cleanText(input.eventSlug, 96) || null : null,
    eventName: category === "faturas" ? cleanText(input.eventName, 140) || null : null,
    fileName,
    mimeType,
    size,
    dataUrl,
    createdAt: now,
    createdBy: session.username,
    updatedAt: now
  };

  const currentDocuments = await getDocumentSummaries();
  const nextDocuments = sortByUpdatedAt([toSummary(document), ...currentDocuments]).slice(0, MAX_DOCUMENTS);
  const activeIds = new Set(nextDocuments.map((candidate) => candidate.id));
  const removedDocuments = currentDocuments.filter((candidate) => !activeIds.has(candidate.id));

  await writeDocumentFile(document);
  await writeDocumentIndex(nextDocuments);
  await Promise.all(removedDocuments.map((candidate) => deleteAppSetting(documentFileKey(candidate.id)).catch(() => undefined)));

  return toSummary(document);
}

export async function deleteArchivedDocument(session: AuthSession, id: string) {
  if (!canDeleteDocuments(session)) {
    throw new DocumentArchiveError("Sem permissão para apagar documentos.", 403);
  }

  const documents = await getDocumentSummaries();
  const document = documents.find((candidate) => candidate.id === id);
  if (!document) throw new DocumentArchiveError("Documento não encontrado.", 404);

  await writeDocumentIndex(documents.filter((candidate) => candidate.id !== id));
  await deleteAppSetting(documentFileKey(id)).catch(() => undefined);
  return document;
}

export async function getArchivedDocumentFile(session: AuthSession, id: string) {
  if (!canDownloadDocuments(session)) {
    throw new DocumentArchiveError("Sem permissão para descarregar documentos.", 403);
  }

  const documents = await getDocumentSummaries();
  if (!documents.some((candidate) => candidate.id === id)) {
    throw new DocumentArchiveError("Documento não encontrado.", 404);
  }

  const storedDocument = await readDocumentFile(id);
  if (storedDocument) return storedDocument;

  const legacyDocument = (await readLegacyDocuments()).find((candidate) => candidate.id === id);
  if (!legacyDocument) throw new DocumentArchiveError("Documento não encontrado.", 404);

  await writeDocumentFile(legacyDocument).catch(() => undefined);
  return legacyDocument;
}

import { randomUUID } from "crypto";
import type { AuthSession } from "./auth-types";
import { deleteAppSetting, readAppSetting, writeAppSetting } from "./app-settings";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ushhacwtmpmwmvpaitdx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const PAGE_SIZE = 1000;
const AUTOMATIC_BACKUP_RETENTION_DAYS = 30;
const AUTOMATIC_BACKUP_RETENTION_MS = AUTOMATIC_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const BACKUP_SETTINGS_KEY = "database_backup_settings";
const BACKUP_RUNS_KEY = "database_backup_runs";
const BACKUP_SNAPSHOT_KEY_PREFIX = "database_backup_snapshot_";
const BACKUP_BUCKET = process.env.SUPABASE_BACKUP_BUCKET || "q26-backups";
const BACKUP_STORAGE_FOLDER = "database-backups";
const BACKUP_FREQUENCY_MS: Record<BackupFrequency, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
};

const EVENT_COLUMNS = [
  "id",
  "slug",
  "nome",
  "folha_excel",
  "ordem_folha",
  "data_texto",
  "data_inicio",
  "data_fim",
  "isento",
  "isento_texto",
  "contabilizar_totais",
  "cor",
  "fechado",
  "tipo",
  "created_at"
];

const MOVEMENT_COLUMNS = [
  "id",
  "evento_id",
  "tipo",
  "item",
  "descricao",
  "data_pagamento",
  "montante",
  "numero_fatura",
  "fatura_com_nif",
  "tipo_pagamento",
  "pago",
  "contabilizar_totais",
  "origem_tabela",
  "origem_linha",
  "formula_montante",
  "raw",
  "created_at"
];

const SETTINGS_COLUMNS = ["key", "value", "updated_at"];

const NOTES_COLUMNS = [
  "id",
  "titulo",
  "conteudo",
  "tipo_tarefa",
  "estado",
  "prioridade",
  "agendado_para",
  "prazo_para",
  "responsavel",
  "categoria",
  "concluido_em",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at"
];

const INVOICE_REPORT_COLUMNS = [
  "id",
  "created_at",
  "created_by",
  "evento_id",
  "evento_slug",
  "evento_nome",
  "valor_fatura",
  "total_despesas",
  "total_itens_acrescentados",
  "total_faturado",
  "diferenca",
  "movimentos_ids",
  "payload"
];

type JsonRecord = Record<string, unknown>;

export type BackupFrequency = "daily" | "weekly";
export type BackupRunStatus = "success" | "error";
export type BackupRunTrigger = "manual" | "automatic";

export type DatabaseBackupSnapshot = {
  exported_at: string;
  version: 1;
  tables: {
    eventos: JsonRecord[];
    movimentos: JsonRecord[];
    app_settings: JsonRecord[];
    notas: JsonRecord[];
    faturas_relatorios: JsonRecord[];
  };
};

export type BackupSettings = {
  enabled: boolean;
  frequency: BackupFrequency;
  updatedAt: string | null;
  updatedBy: string | null;
  lastRunAt: string | null;
  lastStatus: BackupRunStatus | null;
  lastMessage: string | null;
};

export type BackupRun = {
  id: string;
  createdAt: string;
  createdBy: string;
  trigger: BackupRunTrigger;
  status: BackupRunStatus;
  message: string;
  sizeBytes: number;
  counts: Record<string, number>;
  hasSnapshot?: boolean;
  storageBucket?: string;
  storagePath?: string;
  storageProvider?: "supabase-storage";
  snapshot?: DatabaseBackupSnapshot;
};

export type BackupRunSummary = Omit<BackupRun, "snapshot"> & {
  hasSnapshot: boolean;
};

export const defaultBackupSettings: BackupSettings = {
  enabled: false,
  frequency: "daily",
  updatedAt: null,
  updatedBy: null,
  lastRunAt: null,
  lastStatus: null,
  lastMessage: null
};

export function getNextBackupAt(settings: BackupSettings) {
  const anchor = settings.lastRunAt ?? settings.updatedAt;
  if (!anchor) return null;
  const anchorTime = new Date(anchor).getTime();
  if (!Number.isFinite(anchorTime)) return null;
  return new Date(anchorTime + BACKUP_FREQUENCY_MS[settings.frequency]).toISOString();
}

export function shouldRunAutomaticBackup(settings: BackupSettings, now = new Date()) {
  if (!settings.enabled) return false;
  const nextBackupAt = getNextBackupAt(settings);
  if (!nextBackupAt) return true;
  return new Date(nextBackupAt).getTime() <= now.getTime();
}

function endpoint(resource: string) {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`;
}

function storageEndpoint(resource: string) {
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/${resource.replace(/^\//, "")}`;
}

function backupSnapshotKey(id: string) {
  return `${BACKUP_SNAPSHOT_KEY_PREFIX}${id}`;
}

function backupStoragePath(id: string) {
  return `${BACKUP_STORAGE_FOLDER}/${id}.json`;
}

function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function isBackupStorageSettingKey(value: unknown) {
  return typeof value === "string" && (value === BACKUP_RUNS_KEY || value.startsWith(BACKUP_SNAPSHOT_KEY_PREFIX));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFrequency(value: unknown): BackupFrequency {
  return value === "weekly" || value === "daily" ? value : "daily";
}

function normalizeSettings(value: unknown): BackupSettings {
  if (!isRecord(value)) return defaultBackupSettings;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaultBackupSettings.enabled,
    frequency: normalizeFrequency(value.frequency),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    updatedBy: typeof value.updatedBy === "string" ? value.updatedBy : null,
    lastRunAt: typeof value.lastRunAt === "string" ? value.lastRunAt : null,
    lastStatus: value.lastStatus === "success" || value.lastStatus === "error" ? value.lastStatus : null,
    lastMessage: typeof value.lastMessage === "string" ? value.lastMessage : null
  };
}

function normalizeRun(value: unknown): BackupRun | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.createdAt !== "string") return null;
  const storagePath = typeof value.storagePath === "string" ? value.storagePath : undefined;
  const storageBucket = typeof value.storageBucket === "string" ? value.storageBucket : undefined;
  const storageProvider =
    value.storageProvider === "supabase-storage" || storagePath ? "supabase-storage" : undefined;
  return {
    id: value.id,
    createdAt: value.createdAt,
    createdBy: typeof value.createdBy === "string" ? value.createdBy : "Sistema",
    trigger: value.trigger === "automatic" ? "automatic" : "manual",
    status: value.status === "error" ? "error" : "success",
    message: typeof value.message === "string" ? value.message : "",
    sizeBytes: typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes) ? value.sizeBytes : 0,
    counts: isRecord(value.counts)
      ? Object.fromEntries(Object.entries(value.counts).map(([key, count]) => [key, Number(count) || 0]))
      : {},
    hasSnapshot:
      typeof value.hasSnapshot === "boolean" ? value.hasSnapshot : Boolean(storagePath || isRecord(value.snapshot)),
    storageBucket,
    storagePath,
    storageProvider,
    snapshot: isRecord(value.snapshot) ? (value.snapshot as DatabaseBackupSnapshot) : undefined
  };
}

function requireBackupStorageKey() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Falta configurar SUPABASE_SERVICE_ROLE_KEY para guardar backups no bucket.");
  }
  return SUPABASE_SERVICE_ROLE_KEY;
}

function storageHeaders(extra?: HeadersInit) {
  const key = requireBackupStorageKey();
  const headers = new Headers(extra);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  return headers;
}

async function storageRequest(resource: string, init: RequestInit) {
  return fetch(storageEndpoint(resource), {
    ...init,
    headers: storageHeaders(init.headers),
    cache: "no-store"
  });
}

async function storageResponseError(response: Response) {
  const responseText = await response.text().catch(() => "");
  return new Error(`${response.status} ${response.statusText}: ${responseText}`);
}

async function ensureBackupBucket() {
  const encodedBucket = encodeURIComponent(BACKUP_BUCKET);
  const bucketResponse = await storageRequest(`bucket/${encodedBucket}`, { method: "HEAD" });
  if (bucketResponse.ok) return;
  if (bucketResponse.status !== 404) throw await storageResponseError(bucketResponse);

  const createResponse = await storageRequest("bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: BACKUP_BUCKET,
      name: BACKUP_BUCKET,
      public: false
    })
  });

  if (createResponse.ok) return;
  const errorText = await createResponse.text().catch(() => "");
  if (createResponse.status === 409 || /already exists|already_exist|Duplicate/i.test(errorText)) return;
  throw new Error(`${createResponse.status} ${createResponse.statusText}: ${errorText}`);
}

async function uploadBackupSnapshotToBucket(id: string, serialized: string) {
  await ensureBackupBucket();
  const storagePath = backupStoragePath(id);
  const response = await storageRequest(`object/${encodeURIComponent(BACKUP_BUCKET)}/${encodeStoragePath(storagePath)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "x-upsert": "true"
    },
    body: serialized
  });

  if (!response.ok) throw await storageResponseError(response);

  return {
    storageBucket: BACKUP_BUCKET,
    storagePath,
    storageProvider: "supabase-storage" as const
  };
}

async function readBackupSnapshotFromBucket(run: BackupRun) {
  if (!run.storagePath) return null;
  const bucket = run.storageBucket || BACKUP_BUCKET;
  const response = await storageRequest(`object/${encodeURIComponent(bucket)}/${encodeStoragePath(run.storagePath)}`, {
    method: "GET"
  });

  if (response.status === 404) return null;
  if (!response.ok) throw await storageResponseError(response);

  try {
    return (await response.json()) as DatabaseBackupSnapshot;
  } catch {
    throw new Error("O ficheiro do backup guardado no bucket está inválido.");
  }
}

async function deleteBackupSnapshotFromBucket(run: BackupRun) {
  if (!run.storagePath) return;
  const bucket = run.storageBucket || BACKUP_BUCKET;
  const response = await storageRequest(`object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [run.storagePath] })
  });

  if (!response.ok && response.status !== 404) throw await storageResponseError(response);
}

async function deleteStoredSnapshotForRun(run: BackupRun, strictStorageDelete = false) {
  if (strictStorageDelete) {
    await deleteBackupSnapshotFromBucket(run);
    await deleteAppSetting(backupSnapshotKey(run.id)).catch(() => undefined);
    return;
  }

  await Promise.all([
    deleteAppSetting(backupSnapshotKey(run.id)).catch(() => undefined),
    deleteBackupSnapshotFromBucket(run).catch(() => undefined)
  ]);
}

async function supabaseRequest<T>(resource: string, method: string) {
  const response = await fetch(endpoint(resource), {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${responseText}`);
  }

  return (responseText ? JSON.parse(responseText) : null) as T;
}

async function fetchAllRows(table: string, order: string) {
  const rows: JsonRecord[] = [];
  let offset = 0;

  while (true) {
    const page = await supabaseRequest<JsonRecord[]>(
      `${table}?select=*&order=${order}&limit=${PAGE_SIZE}&offset=${offset}`,
      "GET"
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function pickColumns(rows: JsonRecord[], columns: string[]) {
  return rows.map((row) =>
    columns.reduce<JsonRecord>((cleanRow, column) => {
      if (column in row) cleanRow[column] = row[column];
      return cleanRow;
    }, {})
  );
}

function backupCounts(snapshot: DatabaseBackupSnapshot) {
  return Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length]));
}

function backupRunTime(run: BackupRun) {
  const time = new Date(run.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortBackupRuns(runs: BackupRun[]) {
  return [...runs].sort((first, second) => backupRunTime(second) - backupRunTime(first));
}

function isExpiredAutomaticBackup(run: BackupRun, now = new Date()) {
  if (run.trigger !== "automatic") return false;
  const createdAt = backupRunTime(run);
  if (!createdAt) return false;
  return now.getTime() - createdAt > AUTOMATIC_BACKUP_RETENTION_MS;
}

function splitRetainedBackupRuns(runs: BackupRun[], now = new Date()) {
  const sortedRuns = sortBackupRuns(runs);
  return {
    retainedRuns: sortedRuns.filter((run) => !isExpiredAutomaticBackup(run, now)),
    expiredRuns: sortedRuns.filter((run) => isExpiredAutomaticBackup(run, now))
  };
}

export function backupRunSummary(run: BackupRun): BackupRunSummary {
  const { snapshot: _snapshot, ...summary } = run;
  return { ...summary, hasSnapshot: Boolean(run.hasSnapshot || run.snapshot) };
}

function backupRunMetadata(run: BackupRun): BackupRun {
  const { snapshot: _snapshot, ...metadata } = run;
  return metadata;
}

export async function getBackupSettings() {
  return normalizeSettings(await readAppSetting<unknown>(BACKUP_SETTINGS_KEY));
}

export async function saveBackupSettings(input: Partial<BackupSettings>, session: AuthSession) {
  const current = await getBackupSettings();
  const next: BackupSettings = {
    ...current,
    enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    frequency: normalizeFrequency(input.frequency ?? current.frequency),
    updatedAt: new Date().toISOString(),
    updatedBy: session.username
  };
  await writeAppSetting(BACKUP_SETTINGS_KEY, next);
  return next;
}

async function readStoredBackupRuns() {
  const value = await readAppSetting<unknown>(BACKUP_RUNS_KEY);
  if (!Array.isArray(value)) return [];
  const runs = value.map(normalizeRun).filter((run): run is BackupRun => Boolean(run));
  return sortBackupRuns(runs);
}

export async function getBackupRuns() {
  const runs = await readStoredBackupRuns();
  return splitRetainedBackupRuns(runs).retainedRuns;
}

export async function getBackupRunSummaries() {
  return (await getBackupRuns()).map(backupRunSummary);
}

export async function getBackupRun(id: string) {
  const run = (await getBackupRuns()).find((item) => item.id === id) ?? null;
  if (!run) return null;
  const snapshot =
    run.snapshot ??
    (await readBackupSnapshotFromBucket(run)) ??
    (run.hasSnapshot ? await readAppSetting<DatabaseBackupSnapshot>(backupSnapshotKey(id)) : null);
  return snapshot ? { ...run, snapshot } : run;
}

export async function createDatabaseBackupSnapshot(): Promise<DatabaseBackupSnapshot> {
  const [eventos, movimentos, appSettings, notas, faturasRelatorios] = await Promise.all([
    fetchAllRows("eventos", "ordem_folha.asc"),
    fetchAllRows("movimentos", "created_at.asc"),
    fetchAllRows("app_settings", "key.asc"),
    fetchAllRows("notas", "updated_at.asc"),
    fetchAllRows("faturas_relatorios", "created_at.asc")
  ]);

  return {
    exported_at: new Date().toISOString(),
    version: 1,
    tables: {
      eventos: pickColumns(eventos, EVENT_COLUMNS),
      movimentos: pickColumns(movimentos, MOVEMENT_COLUMNS),
      app_settings: pickColumns(
        appSettings.filter((row) => !isBackupStorageSettingKey(row.key)),
        SETTINGS_COLUMNS
      ),
      notas: pickColumns(notas, NOTES_COLUMNS),
      faturas_relatorios: pickColumns(faturasRelatorios, INVOICE_REPORT_COLUMNS)
    }
  };
}

export async function createStoredBackup(session: AuthSession, trigger: BackupRunTrigger) {
  const now = new Date().toISOString();
  const runs = await readStoredBackupRuns();
  let run: BackupRun;

  try {
    const id = randomUUID();
    const snapshot = await createDatabaseBackupSnapshot();
    const serialized = JSON.stringify(snapshot);
    const storageLocation = await uploadBackupSnapshotToBucket(id, serialized);
    run = {
      id,
      createdAt: now,
      createdBy: trigger === "automatic" ? "Sistema" : session.username,
      trigger,
      status: "success",
      message: "Backup criado com sucesso.",
      sizeBytes: Buffer.byteLength(serialized, "utf8"),
      counts: backupCounts(snapshot),
      hasSnapshot: true,
      ...storageLocation
    };
  } catch (error) {
    run = {
      id: randomUUID(),
      createdAt: now,
      createdBy: trigger === "automatic" ? "Sistema" : session.username,
      trigger,
      status: "error",
      message: error instanceof Error ? error.message : "Não foi possível criar o backup.",
      sizeBytes: 0,
      counts: {},
      hasSnapshot: false
    };
  }

  const runMetadata = backupRunMetadata(run);
  const candidateRuns = [runMetadata, ...runs.map(backupRunMetadata)];
  const { retainedRuns: nextRuns, expiredRuns } = splitRetainedBackupRuns(candidateRuns, new Date(now));
  const currentSettings = await getBackupSettings();
  const nextSettings: BackupSettings = {
    ...currentSettings,
    lastRunAt: run.createdAt,
    lastStatus: run.status,
    lastMessage: run.message
  };

  await writeAppSetting(BACKUP_RUNS_KEY, nextRuns);
  await writeAppSetting(BACKUP_SETTINGS_KEY, nextSettings);
  await Promise.all(expiredRuns.map(deleteStoredSnapshotForRun));

  if (run.status === "error") throw new Error(run.message);
  return { run, settings: nextSettings, runs: nextRuns };
}

export async function deleteStoredBackup(id: string) {
  const runs = await readStoredBackupRuns();
  const runToDelete = runs.find((run) => run.id === id) ?? null;
  if (!runToDelete) return null;

  await deleteStoredSnapshotForRun(runToDelete, true);
  const { retainedRuns: nextRuns } = splitRetainedBackupRuns(runs.filter((run) => run.id !== id));
  const nextRunMetadata = nextRuns.map(backupRunMetadata);
  await writeAppSetting(BACKUP_RUNS_KEY, nextRunMetadata);

  return { run: runToDelete, runs: nextRunMetadata };
}

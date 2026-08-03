export type EventoResumo = {
  id: string;
  slug: string;
  nome: string;
  folha_excel: string;
  ordem_folha: number;
  data_texto: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  isento?: boolean | null;
  isento_texto: string | null;
  contabilizar_totais?: boolean | null;
  cor: string | null;
  fechado?: boolean | null;
  tipo: "evento" | "categoria";
  total_entradas: number;
  total_saidas: number;
  total_a_pagamento: number;
  saldo: number;
  total_movimentos: number;
};

export type MovimentoDetalhe = {
  id: string;
  evento_slug: string;
  evento_nome: string;
  evento_tipo: "evento" | "categoria";
  evento_data_inicio: string | null;
  tipo: "entrada" | "saida" | "a_pagamento";
  item: string;
  descricao: string | null;
  data_pagamento: string | null;
  montante: number | null;
  numero_fatura: string | null;
  fatura_com_nif: boolean | null;
  tipo_pagamento: string | null;
  pago: boolean | null;
  contabilizar_totais?: boolean | null;
  origem_tabela: string;
  origem_linha: number;
  formula_montante: string | null;
  raw: Record<string, unknown>;
  created_at: string;
};

export type FaturacaoReportItem = {
  id: string;
  evento_slug: string;
  evento_nome: string;
  item: string;
  descricao: string | null;
  data_pagamento: string | null;
  tipo_pagamento: string | null;
  numero_fatura: string | null;
  montante: number;
  raw?: Record<string, unknown>;
};

export type FaturacaoReportPayload = {
  finalizado_em: string;
  evento: {
    id: string | null;
    slug: string;
    nome: string;
  };
  despesas_evento: FaturacaoReportItem[];
  itens_acrescentados: FaturacaoReportItem[];
  transferencias_sem_nif?: FaturacaoReportItem[];
  totais: {
    despesas_evento: number;
    itens_acrescentados: number;
    total_faturado: number;
    valor_fatura: number;
    diferenca: number;
    transferencias_com_nif?: number;
    transferencias_sem_nif?: number;
    montante_depositar?: number;
    formula_montante_depositar?: "valor_fatura_mais_diferenca" | "valor_fatura_mais_total_faturado";
  };
};

export type FaturacaoReport = {
  id: string;
  created_at: string;
  created_by: string;
  evento_id: string | null;
  evento_slug: string;
  evento_nome: string;
  valor_fatura: number;
  total_despesas: number;
  total_itens_acrescentados: number;
  total_faturado: number;
  diferenca: number;
  movimentos_ids: string[];
  payload: FaturacaoReportPayload;
};

export type Nota = {
  id: string;
  titulo: string;
  conteudo: string;
  tipo_tarefa?: "task" | "lembrete" | "follow_up" | "evento" | "outro" | null;
  estado?: "todo" | "em_curso" | "concluido" | "cancelado" | null;
  prioridade?: "baixa" | "normal" | "alta" | "urgente" | null;
  agendado_para?: string | null;
  prazo_para?: string | null;
  responsavel?: string | null;
  categoria?: string | null;
  concluido_em?: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type FetchResult<T> = {
  data: T[];
  error: string | null;
};

type EventoLockRow = {
  id: string;
  fechado: boolean | null;
};

type EventoBaseRow = {
  id: string;
  slug: string;
  nome: string;
  folha_excel: string;
  ordem_folha: number;
  data_texto: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  isento?: boolean | null;
  isento_texto: string | null;
  contabilizar_totais?: boolean | null;
  cor: string | null;
  fechado?: boolean | null;
  tipo: "evento" | "categoria";
};

type RawValue = Record<string, unknown>;

const FALLBACK_SUPABASE_URL = "https://ushhacwtmpmwmvpaitdx.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";
const EVENTO_RESUMO_SELECT =
  "id,slug,nome,folha_excel,ordem_folha,data_texto,data_inicio,data_fim,isento,isento_texto,contabilizar_totais,cor,fechado,tipo,total_entradas,total_saidas,total_a_pagamento,saldo,total_movimentos";
const CLIENT_RAW_KEYS = [
  "faturar_mais_tarde",
  "tipo_entrada",
  "patrocinio",
  "precisa_fatura",
  "necessita_fatura",
  "fatura_emitida",
  "valor_teorico",
  "ultima_alteracao",
  "fatura_patrocinio_meta",
  "ficheiro_fatura_patrocinio_meta"
] as const;
const MOVIMENTO_FILE_META_ALIAS_KEYS = [
  "fatura_patrocinio_file_name",
  "fatura_patrocinio_content_type",
  "fatura_patrocinio_size",
  "fatura_patrocinio_uploaded_at",
  "fatura_patrocinio_uploaded_by",
  "ficheiro_fatura_patrocinio_file_name",
  "ficheiro_fatura_patrocinio_content_type",
  "ficheiro_fatura_patrocinio_size",
  "ficheiro_fatura_patrocinio_uploaded_at",
  "ficheiro_fatura_patrocinio_uploaded_by"
] as const;
const MOVIMENTO_BASE_COLUMNS = [
  "id",
  "evento_slug",
  "evento_nome",
  "evento_tipo",
  "evento_data_inicio",
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
  "created_at"
] as const;
const MOVIMENTO_RAW_COLUMNS = CLIENT_RAW_KEYS.map((key) => `${key}:raw->${key}`);
const MOVIMENTO_FILE_META_COLUMNS = [
  "fatura_patrocinio_file_name:raw->fatura_patrocinio->>fileName",
  "fatura_patrocinio_content_type:raw->fatura_patrocinio->>contentType",
  "fatura_patrocinio_size:raw->fatura_patrocinio->>size",
  "fatura_patrocinio_uploaded_at:raw->fatura_patrocinio->>uploadedAt",
  "fatura_patrocinio_uploaded_by:raw->fatura_patrocinio->>uploadedBy",
  "ficheiro_fatura_patrocinio_file_name:raw->ficheiro_fatura_patrocinio->>fileName",
  "ficheiro_fatura_patrocinio_content_type:raw->ficheiro_fatura_patrocinio->>contentType",
  "ficheiro_fatura_patrocinio_size:raw->ficheiro_fatura_patrocinio->>size",
  "ficheiro_fatura_patrocinio_uploaded_at:raw->ficheiro_fatura_patrocinio->>uploadedAt",
  "ficheiro_fatura_patrocinio_uploaded_by:raw->ficheiro_fatura_patrocinio->>uploadedBy"
];
const MOVIMENTO_DETALHE_SELECT = [...MOVIMENTO_BASE_COLUMNS, ...MOVIMENTO_RAW_COLUMNS, ...MOVIMENTO_FILE_META_COLUMNS].join(",");
const MOVIMENTO_RAW_ALIAS_KEYS = [...CLIENT_RAW_KEYS, ...MOVIMENTO_FILE_META_ALIAS_KEYS] as const;

type ClientRawKey = (typeof CLIENT_RAW_KEYS)[number];
type MovementRawAliasKey = (typeof MOVIMENTO_RAW_ALIAS_KEYS)[number];
type MovimentoDetalheRow = Omit<MovimentoDetalhe, "raw"> & {
  raw?: Record<string, unknown> | null;
} & Partial<Record<MovementRawAliasKey, unknown>>;

function cleanRawString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numericRawValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function invoiceFileMetaFromValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const fileName = cleanRawString(source.fileName);
  if (!fileName) return null;

  const meta: RawValue = {
    fileName,
    hasAttachment: true
  };
  const contentType = cleanRawString(source.contentType);
  const uploadedAt = cleanRawString(source.uploadedAt);
  const uploadedBy = cleanRawString(source.uploadedBy);
  const size = numericRawValue(source.size);

  if (contentType) meta.contentType = contentType;
  if (uploadedAt) meta.uploadedAt = uploadedAt;
  if (uploadedBy) meta.uploadedBy = uploadedBy;
  if (size !== null) meta.size = size;

  return meta;
}

function invoiceFileMetaFromAliases(movimento: MovimentoDetalhe | MovimentoDetalheRow, prefix: "fatura_patrocinio" | "ficheiro_fatura_patrocinio") {
  const row = movimento as Partial<Record<MovementRawAliasKey, unknown>>;
  const fileName = cleanRawString(row[`${prefix}_file_name`]);
  if (!fileName) return null;

  const meta: RawValue = {
    fileName,
    hasAttachment: true
  };
  const contentType = cleanRawString(row[`${prefix}_content_type`]);
  const uploadedAt = cleanRawString(row[`${prefix}_uploaded_at`]);
  const uploadedBy = cleanRawString(row[`${prefix}_uploaded_by`]);
  const size = numericRawValue(row[`${prefix}_size`]);

  if (contentType) meta.contentType = contentType;
  if (uploadedAt) meta.uploadedAt = uploadedAt;
  if (uploadedBy) meta.uploadedBy = uploadedBy;
  if (size !== null) meta.size = size;

  return meta;
}

function compactMovementRaw(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const compacted = CLIENT_RAW_KEYS.reduce<RawValue>((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      acc[key] = raw[key];
    }
    return acc;
  }, {});

  const directInvoiceMeta = invoiceFileMetaFromValue(raw.fatura_patrocinio);
  const legacyInvoiceMeta = invoiceFileMetaFromValue(raw.ficheiro_fatura_patrocinio);
  if (directInvoiceMeta && !compacted.fatura_patrocinio_meta) compacted.fatura_patrocinio_meta = directInvoiceMeta;
  if (legacyInvoiceMeta && !compacted.ficheiro_fatura_patrocinio_meta) {
    compacted.ficheiro_fatura_patrocinio_meta = legacyInvoiceMeta;
  }

  return compacted;
}

function compactMovementRawFromRow(movimento: MovimentoDetalhe | MovimentoDetalheRow) {
  if ("raw" in movimento && movimento.raw) return compactMovementRaw(movimento.raw);

  const compacted = CLIENT_RAW_KEYS.reduce<RawValue>((acc, key) => {
    const value = (movimento as Partial<Record<MovementRawAliasKey, unknown>>)[key];
    if (value !== null && typeof value !== "undefined") {
      acc[key] = value;
    }
    return acc;
  }, {});

  const directInvoiceMeta = invoiceFileMetaFromAliases(movimento, "fatura_patrocinio");
  const legacyInvoiceMeta = invoiceFileMetaFromAliases(movimento, "ficheiro_fatura_patrocinio");
  if (directInvoiceMeta && !compacted.fatura_patrocinio_meta) compacted.fatura_patrocinio_meta = directInvoiceMeta;
  if (legacyInvoiceMeta && !compacted.ficheiro_fatura_patrocinio_meta) {
    compacted.ficheiro_fatura_patrocinio_meta = legacyInvoiceMeta;
  }

  return compacted;
}

function compactMovement(movimento: MovimentoDetalhe | MovimentoDetalheRow): MovimentoDetalhe {
  const compacted = {
    ...movimento,
    raw: compactMovementRawFromRow(movimento)
  } as MovimentoDetalhe & Partial<Record<MovementRawAliasKey, unknown>>;

  MOVIMENTO_RAW_ALIAS_KEYS.forEach((key) => {
    delete compacted[key];
  });

  return compacted;
}

async function fetchSupabase<T>(resource: string, query: string): Promise<FetchResult<T>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${resource}?${query}`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    return { data: [], error: `${response.status} ${response.statusText}: ${body}` };
  }

  const data = (await response.json()) as T[];
  return { data, error: null };
}

export async function getTesourariaData() {
  const [eventos, movimentos, eventLocks] = await Promise.all([
    fetchSupabase<EventoResumo>("eventos_resumo", `select=${EVENTO_RESUMO_SELECT}&order=ordem_folha.asc`),
    fetchSupabase<MovimentoDetalheRow>(
      "movimentos_detalhe",
      `select=${MOVIMENTO_DETALHE_SELECT}&order=data_pagamento.desc.nullslast,evento_nome.asc,item.asc&limit=10000`
    ),
    fetchSupabase<EventoLockRow>("eventos", "select=id,fechado")
  ]);
  const lockedById = new Map(eventLocks.data.map((event) => [event.id, event.fechado === true]));

  return {
    eventos: eventos.data.map((event) => ({
      ...event,
      fechado: lockedById.get(event.id) ?? event.fechado ?? false
    })),
    movimentos: movimentos.data.map(compactMovement),
    error: eventos.error ?? movimentos.error ?? eventLocks.error
  };
}

export async function getEventSummaries() {
  const [eventos, eventLocks] = await Promise.all([
    fetchSupabase<EventoResumo>("eventos_resumo", `select=${EVENTO_RESUMO_SELECT}&order=ordem_folha.asc`),
    fetchSupabase<EventoLockRow>("eventos", "select=id,fechado")
  ]);
  const lockedById = new Map(eventLocks.data.map((event) => [event.id, event.fechado === true]));

  return {
    data: eventos.data.map((event) => ({
      ...event,
      fechado: lockedById.get(event.id) ?? event.fechado ?? false
    })),
    error: eventos.error ?? eventLocks.error
  };
}

export async function getPendingPayments() {
  const movimentos = await fetchSupabase<MovimentoDetalheRow>(
    "movimentos_detalhe",
    `select=${MOVIMENTO_DETALHE_SELECT}&tipo=neq.entrada&pago=eq.false&order=data_pagamento.asc.nullslast,evento_nome.asc,item.asc&limit=1000`
  );

  return {
    data: movimentos.data.map(compactMovement),
    error: movimentos.error
  };
}

export async function getPendingPaymentCount() {
  const movimentos = await fetchSupabase<{ id: string }>(
    "movimentos_detalhe",
    "select=id&tipo=neq.entrada&pago=eq.false&limit=1000"
  );

  return {
    count: movimentos.data.length,
    error: movimentos.error
  };
}

export async function getClosedEvents() {
  const [eventos, resumo] = await Promise.all([
    fetchSupabase<EventoBaseRow>(
      "eventos",
      "select=id,slug,nome,folha_excel,ordem_folha,data_texto,data_inicio,data_fim,isento,isento_texto,contabilizar_totais,cor,fechado,tipo&fechado=eq.true&order=data_inicio.asc.nullslast,ordem_folha.asc"
    ),
    fetchSupabase<EventoResumo>(
      "eventos_resumo",
      `select=${EVENTO_RESUMO_SELECT}&order=data_inicio.asc.nullslast,ordem_folha.asc`
    )
  ]);

  const closedIds = new Set(eventos.data.map((event) => event.id));
  const resumoFechados = resumo.data
    .filter((event) => closedIds.has(event.id))
    .map((event) => ({ ...event, fechado: true }));

  if (resumoFechados.length) {
    return {
      data: resumoFechados,
      error: eventos.error ?? resumo.error
    };
  }

  if (!eventos.data.length) {
    return {
      data: [],
      error: eventos.error
    };
  }

  return {
    data: eventos.data.map((event) => ({
      ...event,
      total_entradas: 0,
      total_saidas: 0,
      total_a_pagamento: 0,
      saldo: 0,
      total_movimentos: 0
    })),
    error: eventos.error
  };
}

export async function getFaturacaoReports(limit = 50) {
  return fetchSupabase<FaturacaoReport>("faturas_relatorios", `select=*&order=created_at.desc&limit=${limit}`);
}

export async function getNotas(limit = 100) {
  return fetchSupabase<Nota>("notas", `select=*&order=updated_at.desc,created_at.desc&limit=${limit}`);
}

export async function getNotificationNotas(limit = 150) {
  return fetchSupabase<Pick<Nota, "id" | "estado" | "prioridade" | "responsavel">>(
    "notas",
    `select=id,estado,prioridade,responsavel&order=updated_at.desc,created_at.desc&limit=${limit}`
  );
}

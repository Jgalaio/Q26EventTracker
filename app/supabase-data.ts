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

const FALLBACK_SUPABASE_URL = "https://ushhacwtmpmwmvpaitdx.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";

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
    fetchSupabase<EventoResumo>("eventos_resumo", "select=*&order=ordem_folha.asc"),
    fetchSupabase<MovimentoDetalhe>(
      "movimentos_detalhe",
      "select=*&order=data_pagamento.desc.nullslast,evento_nome.asc,item.asc&limit=10000"
    ),
    fetchSupabase<EventoLockRow>("eventos", "select=id,fechado")
  ]);
  const lockedById = new Map(eventLocks.data.map((event) => [event.id, event.fechado === true]));

  return {
    eventos: eventos.data.map((event) => ({
      ...event,
      fechado: lockedById.get(event.id) ?? event.fechado ?? false
    })),
    movimentos: movimentos.data,
    error: eventos.error ?? movimentos.error ?? eventLocks.error
  };
}

export async function getClosedEvents() {
  const [eventos, resumo] = await Promise.all([
    fetchSupabase<EventoBaseRow>(
      "eventos",
      "select=id,slug,nome,folha_excel,ordem_folha,data_texto,data_inicio,data_fim,isento,isento_texto,contabilizar_totais,cor,fechado,tipo&fechado=eq.true&order=data_inicio.asc.nullslast,ordem_folha.asc"
    ),
    fetchSupabase<EventoResumo>("eventos_resumo", "select=*&order=data_inicio.asc.nullslast,ordem_folha.asc")
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

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
  origem_tabela: string;
  origem_linha: number;
  formula_montante: string | null;
  raw: Record<string, unknown>;
  created_at: string;
};

type FetchResult<T> = {
  data: T[];
  error: string | null;
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
  const [eventos, movimentos] = await Promise.all([
    fetchSupabase<EventoResumo>("eventos_resumo", "select=*&order=ordem_folha.asc"),
    fetchSupabase<MovimentoDetalhe>(
      "movimentos_detalhe",
      "select=*&order=data_pagamento.desc.nullslast,evento_nome.asc,item.asc&limit=2000"
    )
  ]);

  return {
    eventos: eventos.data,
    movimentos: movimentos.data,
    error: eventos.error ?? movimentos.error
  };
}

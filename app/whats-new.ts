import { readAppSetting, writeAppSetting } from "./app-settings";

export type WhatsNewEntry = {
  id: string;
  title: string;
  date: string;
  summary: string;
  items: string[];
};

export type WhatsNewSeenState = {
  releaseId: string;
  seenAt: string;
};

export const WHATS_NEW_RELEASES: WhatsNewEntry[] = [
  {
    id: "2026-07-23-arquivo-documentos",
    title: "Arquivo de documentos",
    date: "2026-07-23",
    summary: "Foi adicionada uma área própria para guardar documentos importantes.",
    items: [
      "A nova página Documentos permite arquivar PDFs, imagens, Word, Excel, PowerPoint, texto e CSV.",
      "Cada documento pode ter categoria, descrição e etiquetas para facilitar a consulta.",
      "A pesquisa global também passa a encontrar documentos arquivados."
    ]
  },
  {
    id: "2026-07-23-alertas-suporte",
    title: "Alertas internos e suporte melhorado",
    date: "2026-07-23",
    summary: "O topo da aplicação passa a mostrar alertas operacionais e o suporte ganhou filtros.",
    items: [
      "O novo botão Alertas mostra tickets pendentes, TODO urgentes, pagamentos em falta e avisos de backup.",
      "Os tickets de suporte passam a ter categoria: Bug, Pedido, Dúvida, Acesso ou Outro.",
      "A página de suporte ganhou filtros por estado, urgência e categoria."
    ]
  },
  {
    id: "2026-07-21-suporte-tickets",
    title: "Sistema de suporte",
    date: "2026-07-21",
    summary: "A aplicação passa a ter uma área própria para pedidos de suporte.",
    items: [
      "Os utilizadores podem abrir tickets com assunto, urgência, texto e imagens.",
      "Cada utilizador acompanha os seus pedidos numa conversa organizada.",
      "O Admin vê todos os tickets, responde e pode alterar o estado do pedido."
    ]
  },
  {
    id: "2026-07-21-datas-nas-entradas",
    title: "Datas nas entradas",
    date: "2026-07-21",
    summary: "As entradas da Tesouraria passam a poder ter data associada.",
    items: [
      "Ao adicionar uma entrada, existe agora um campo de data.",
      "A data fica gravada no movimento e aparece na tabela de entradas.",
      "Novas entradas começam com a data de hoje, podendo ser alterada ou limpa."
    ]
  },
  {
    id: "2026-07-17-panoramas-eventos-patrocinios-peditorio",
    title: "Novos resumos por área",
    date: "2026-07-17",
    summary: "Os panoramas financeiros passam a separar melhor Eventos, Patrocínios e Peditório.",
    items: [
      "A página inicial e o OverView mostram cartões separados para Eventos, Patrocínios e Peditório.",
      "A capa do relatório geral também apresenta estes três saldos.",
      "As abas Patrocínios e Peditório na Tesouraria mostram apenas cartões relevantes da respetiva área."
    ]
  },
  {
    id: "2026-07-17-tesouraria-abas-peditorio-patrocinios",
    title: "Novidades na Tesouraria",
    date: "2026-07-17",
    summary: "A Tesouraria ficou mais organizada para separar melhor os eventos, os patrocínios e o peditório.",
    items: [
      "Peditório e Patrocínios Festa passam a ter abas próprias, tal como a Conta Bancaria.",
      "Os eventos normais deixam de misturar esses movimentos na lista principal de eventos.",
      "Foram adicionados cartões de resumo para Eventos, Patrocínios e Peditório.",
      "Os totais gerais continuam a considerar todos os movimentos contabilizáveis."
    ]
  }
];

export const latestWhatsNew = WHATS_NEW_RELEASES[0] ?? null;

function seenKey(username: string) {
  return `whats_new_seen:${encodeURIComponent(username.trim())}`;
}

export async function getPendingWhatsNew(username: string) {
  if (!latestWhatsNew) return null;

  const seen = await readAppSetting<WhatsNewSeenState>(seenKey(username));
  return seen?.releaseId === latestWhatsNew.id ? null : latestWhatsNew;
}

export async function markLatestWhatsNewAsSeen(username: string) {
  if (!latestWhatsNew) return null;

  const state: WhatsNewSeenState = {
    releaseId: latestWhatsNew.id,
    seenAt: new Date().toISOString()
  };

  await writeAppSetting(seenKey(username), state);
  return state;
}

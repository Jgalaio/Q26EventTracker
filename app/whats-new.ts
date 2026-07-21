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
      "Peditório e Patrocínios Festa passam a ter abas próprias, tal como a Conta Q26.",
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

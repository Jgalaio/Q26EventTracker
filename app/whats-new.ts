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

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AppLogo } from "../app-settings";
import type { AuthSession } from "../auth-types";
import type { ArchivedDocumentSummary } from "../document-archive";
import type { EventoResumo, MovimentoDetalhe, Nota } from "../supabase-data";
import { TopbarActions } from "../topbar-actions";
import { TopbarBrand } from "../topbar-brand";

type SearchKind = "evento" | "movimento" | "todo" | "documento";
type SearchFilter = "todos" | SearchKind;

type GlobalSearchClientProps = {
  eventos: EventoResumo[];
  movimentos: MovimentoDetalhe[];
  notas: Nota[];
  documents: ArchivedDocumentSummary[];
  error: string | null;
  session: AuthSession;
  appLogo: AppLogo | null;
};

type SearchResult = {
  id: string;
  kind: SearchKind;
  badge: string;
  title: string;
  source: string;
  detail: string;
  date: string;
  amount: number | null;
  amountText?: string;
  href: string;
  haystack: string;
};

const moneyFormatter = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return dateTimeFormatter.format(new Date(value));
}

function movementLabel(tipo: MovimentoDetalhe["tipo"]) {
  if (tipo === "entrada") return "Entrada";
  if (tipo === "saida") return "Saída";
  return "A pagamento";
}

function noteStatusLabel(value: Nota["estado"]) {
  if (value === "em_curso") return "Em curso";
  if (value === "concluido") return "Concluído";
  if (value === "cancelado") return "Cancelado";
  return "A fazer";
}

function notePriorityLabel(value: Nota["prioridade"]) {
  if (value === "baixa") return "Baixa";
  if (value === "alta") return "Alta";
  if (value === "urgente") return "Urgente";
  return "Normal";
}

function documentCategoryLabel(value: ArchivedDocumentSummary["category"]) {
  if (value === "atas") return "Atas";
  if (value === "faturas") return "Faturas";
  if (value === "contratos") return "Contratos";
  if (value === "recibos") return "Recibos";
  if (value === "licencas") return "Licenças";
  if (value === "imagens") return "Imagens";
  return "Outro";
}

function formatBytes(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} MB`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} KB`;
  return `${value} B`;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDetail(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(" · ");
}

function rawText(raw: Record<string, unknown>) {
  return Object.entries(raw)
    .map(([key, value]) => `${key} ${String(value ?? "")}`)
    .join(" ");
}

function eventSearchResult(event: EventoResumo): SearchResult {
  const totalMovimentos = Number(event.total_movimentos ?? 0);
  const detail = cleanDetail([
    event.data_inicio ? formatDate(event.data_inicio) : event.data_texto,
    event.fechado ? "Fechado" : null,
    event.contabilizar_totais === false ? "Só registo" : null,
    `${totalMovimentos} movimentos`
  ]);
  const searchable = [
    event.id,
    event.slug,
    event.nome,
    event.folha_excel,
    event.data_texto,
    event.data_inicio,
    event.data_fim,
    event.isento_texto,
    event.tipo,
    formatMoney(event.total_entradas),
    formatMoney(event.total_saidas),
    formatMoney(event.saldo),
    detail
  ].join(" ");

  return {
    id: event.id,
    kind: "evento",
    badge: "Evento",
    title: event.nome,
    source: event.tipo === "categoria" ? "Categoria" : "Evento",
    detail,
    date: event.data_inicio ? formatDate(event.data_inicio) : event.data_texto ?? "-",
    amount: event.saldo,
    href: `/tesouraria?event=${encodeURIComponent(event.slug)}`,
    haystack: normalizeText(searchable)
  };
}

function movementSearchResult(movimento: MovimentoDetalhe): SearchResult {
  const amount = Number(movimento.montante ?? 0);
  const payment = movimento.tipo_pagamento?.trim() || "-";
  const detail = cleanDetail([
    movimento.descricao,
    `Pagamento: ${payment}`,
    movimento.numero_fatura ? `Fatura: ${movimento.numero_fatura}` : null,
    typeof movimento.fatura_com_nif === "boolean" ? `Fatura C/NIF: ${movimento.fatura_com_nif ? "Sim" : "Não"}` : null,
    typeof movimento.pago === "boolean" ? `Pago: ${movimento.pago ? "Sim" : "Não"}` : null,
    movimento.contabilizar_totais === false ? "Fora dos totais gerais" : null,
    `${movimento.origem_tabela} linha ${movimento.origem_linha}`
  ]);
  const searchable = [
    movimento.id,
    movimento.evento_slug,
    movimento.evento_nome,
    movimento.tipo,
    movementLabel(movimento.tipo),
    movimento.item,
    movimento.descricao,
    movimento.data_pagamento,
    movimento.numero_fatura,
    movimento.tipo_pagamento,
    movimento.pago === false ? "por pagar pagamento em falta não pago" : "pago",
    movimento.fatura_com_nif === true ? "fatura com nif sim faturado" : "fatura sem nif nao faturado",
    formatMoney(amount),
    amount,
    rawText(movimento.raw)
  ].join(" ");

  return {
    id: movimento.id,
    kind: "movimento",
    badge: movementLabel(movimento.tipo),
    title: movimento.item || "Sem item",
    source: movimento.evento_nome,
    detail,
    date: formatDate(movimento.data_pagamento),
    amount,
    href: `/tesouraria?movement=${encodeURIComponent(movimento.id)}`,
    haystack: normalizeText(searchable)
  };
}

function noteSearchResult(note: Nota): SearchResult {
  const schedule = note.agendado_para ?? note.prazo_para ?? note.updated_at;
  const detail = cleanDetail([
    note.conteudo || "Sem descrição",
    note.responsavel ? `Responsável: ${note.responsavel}` : null,
    note.categoria ? `Categoria: ${note.categoria}` : null,
    `${noteStatusLabel(note.estado)} · Prioridade ${notePriorityLabel(note.prioridade)}`
  ]);
  const searchable = [
    note.id,
    note.titulo,
    note.conteudo,
    note.tipo_tarefa,
    note.estado,
    note.prioridade,
    note.responsavel,
    note.categoria,
    note.created_by,
    note.updated_by,
    detail
  ].join(" ");

  return {
    id: note.id,
    kind: "todo",
    badge: "TODO",
    title: note.titulo,
    source: noteStatusLabel(note.estado),
    detail,
    date: formatDateTime(schedule),
    amount: null,
    href: `/notas?nota=${encodeURIComponent(note.id)}`,
    haystack: normalizeText(searchable)
  };
}

function documentSearchResult(document: ArchivedDocumentSummary): SearchResult {
  const category = documentCategoryLabel(document.category);
  const detail = cleanDetail([
    document.description || "Sem descrição",
    `Categoria: ${category}`,
    `Ficheiro: ${document.fileName}`,
    document.tags.length ? `Etiquetas: ${document.tags.join(", ")}` : null
  ]);
  const searchable = [
    document.id,
    document.title,
    document.description,
    document.fileName,
    document.category,
    category,
    document.createdBy,
    document.tags.join(" ")
  ].join(" ");

  return {
    id: document.id,
    kind: "documento",
    badge: "Documento",
    title: document.title,
    source: category,
    detail,
    date: formatDateTime(document.createdAt),
    amount: null,
    amountText: formatBytes(document.size),
    href: `/documentos?documento=${encodeURIComponent(document.id)}`,
    haystack: normalizeText(searchable)
  };
}

function countByKind(results: SearchResult[]) {
  return results.reduce(
    (acc, result) => {
      acc[result.kind] += 1;
      return acc;
    },
    { evento: 0, movimento: 0, todo: 0, documento: 0 }
  );
}

function matchesTokens(result: SearchResult, tokens: string[]) {
  return tokens.every((token) => result.haystack.includes(token));
}

export function GlobalSearchClient({
  eventos,
  movimentos,
  notas,
  documents,
  error,
  session,
  appLogo
}: GlobalSearchClientProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("todos");
  const index = useMemo(
    () => [
      ...eventos.filter((event) => event.slug !== "contas").map(eventSearchResult),
      ...movimentos.map(movementSearchResult),
      ...notas.map(noteSearchResult),
      ...documents.map(documentSearchResult)
    ],
    [documents, eventos, movimentos, notas]
  );
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  const resultsByQuery = useMemo(() => {
    if (!tokens.length) return [];
    return index.filter((result) => matchesTokens(result, tokens));
  }, [index, tokens]);
  const counts = countByKind(resultsByQuery);
  const filteredResults = useMemo(() => {
    if (filter === "todos") return resultsByQuery;
    return resultsByQuery.filter((result) => result.kind === filter);
  }, [filter, resultsByQuery]);
  const visibleResults = filteredResults.slice(0, 120);
  const totalCounts = countByKind(index);

  return (
    <main className="shell search-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Pesquisa" />
        <TopbarActions active="pesquisa" session={session} />
      </section>

      {error ? <section className="notice">Não consegui carregar todos os dados. {error}</section> : null}

      <section className="search-panel" aria-label="Pesquisa global">
        <div className="search-heading">
          <div>
            <p className="eyebrow">Pesquisa global</p>
            <h2>Encontrar eventos, movimentos, TODO e documentos</h2>
          </div>
          <span>
            {index.length} registos indexados · {totalCounts.evento} eventos · {totalCounts.movimento} movimentos ·{" "}
            {totalCounts.todo} tarefas · {totalCounts.documento} documentos
          </span>
        </div>

        <div className="global-search-box">
          <label htmlFor="global-search-input">Pesquisar</label>
          <input
            autoFocus
            id="global-search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Evento, item, descrição, fatura, valor, data, pagamento..."
            type="search"
            value={query}
          />
        </div>

        <div className="search-filter-tabs" role="tablist" aria-label="Tipo de resultado">
          <button aria-selected={filter === "todos"} onClick={() => setFilter("todos")} role="tab" type="button">
            Todos <span>{resultsByQuery.length}</span>
          </button>
          <button aria-selected={filter === "evento"} onClick={() => setFilter("evento")} role="tab" type="button">
            Eventos <span>{counts.evento}</span>
          </button>
          <button
            aria-selected={filter === "movimento"}
            onClick={() => setFilter("movimento")}
            role="tab"
            type="button"
          >
            Movimentos <span>{counts.movimento}</span>
          </button>
          <button aria-selected={filter === "todo"} onClick={() => setFilter("todo")} role="tab" type="button">
            TODO <span>{counts.todo}</span>
          </button>
          <button
            aria-selected={filter === "documento"}
            onClick={() => setFilter("documento")}
            role="tab"
            type="button"
          >
            Documentos <span>{counts.documento}</span>
          </button>
        </div>
      </section>

      <section className="search-summary-grid" aria-label="Resumo da pesquisa">
        <article>
          <span>Resultados</span>
          <strong>{resultsByQuery.length}</strong>
        </article>
        <article>
          <span>Eventos</span>
          <strong>{counts.evento}</strong>
        </article>
        <article>
          <span>Movimentos</span>
          <strong>{counts.movimento}</strong>
        </article>
        <article>
          <span>TODO</span>
          <strong>{counts.todo}</strong>
        </article>
        <article>
          <span>Documentos</span>
          <strong>{counts.documento}</strong>
        </article>
      </section>

      <section className="search-results-panel">
        <div className="search-results-heading">
          <div>
            <p className="eyebrow">Resultados</p>
            <h2>{tokens.length ? `${filteredResults.length} encontrados` : "Começa por escrever uma pesquisa"}</h2>
          </div>
          {filteredResults.length > visibleResults.length ? <span>A mostrar os primeiros {visibleResults.length}</span> : null}
        </div>

        {tokens.length && visibleResults.length ? (
          <div className="table-wrap global-search-table-wrap">
            <table className="global-search-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Resultado</th>
                  <th>Origem</th>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {visibleResults.map((result) => (
                  <tr key={`${result.kind}-${result.id}`}>
                    <td>
                      <span className={`search-result-badge ${result.kind}`}>{result.badge}</span>
                    </td>
                    <td className="search-result-main-cell">
                      <strong>{result.title}</strong>
                      <small>{result.detail || "Sem detalhe adicional"}</small>
                    </td>
                    <td>{result.source}</td>
                    <td>{result.date}</td>
                    <td>{result.amountText ?? (result.amount === null ? "-" : formatMoney(result.amount))}</td>
                    <td>
                      <Link className="search-open-link" href={result.href}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-search-state">
            <strong>{tokens.length ? "Sem resultados para esta pesquisa." : "Pesquisa por qualquer palavra ou valor."}</strong>
            <span>
              Experimenta nomes de eventos, fornecedores, descrições, valores, números de fatura, datas ou métodos de
              pagamento.
            </span>
          </div>
        )}
      </section>
    </main>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { EventoResumo, MovimentoDetalhe } from "./supabase-data";

type DashboardProps = {
  eventos: EventoResumo[];
  movimentos: MovimentoDetalhe[];
  error: string | null;
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

function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function movementLabel(tipo: MovimentoDetalhe["tipo"]) {
  if (tipo === "entrada") return "Entrada";
  if (tipo === "saida") return "Saída";
  return "A pagamento";
}

export function Dashboard({ eventos, movimentos, error }: DashboardProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"entrada" | "saida">("entrada");
  const [pago, setPago] = useState<"todos" | "sim" | "nao">("todos");
  const [selectedSlug, setSelectedSlug] = useState<string>("todos");

  const totals = useMemo(() => {
    return eventos.reduce(
      (acc, event) => {
        acc.entradas += Number(event.total_entradas ?? 0);
        acc.saidas += Number(event.total_saidas ?? 0);
        acc.aPagamento += Number(event.total_a_pagamento ?? 0);
        acc.movimentos += Number(event.total_movimentos ?? 0);
        return acc;
      },
      { entradas: 0, saidas: 0, aPagamento: 0, movimentos: 0 }
    );
  }, [eventos]);

  const normalizedQuery = query.trim().toLowerCase();
  const tabCounts = useMemo(() => {
    return movimentos.reduce(
      (acc, movimento) => {
        if (movimento.tipo === "entrada") {
          acc.entradas += 1;
        } else {
          acc.saidas += 1;
        }
        return acc;
      },
      { entradas: 0, saidas: 0 }
    );
  }, [movimentos]);

  const filteredMovimentos = useMemo(() => {
    return movimentos.filter((movimento) => {
      const matchesTab = activeTab === "entrada" ? movimento.tipo === "entrada" : movimento.tipo !== "entrada";
      const matchesQuery =
        !normalizedQuery ||
        movimento.item.toLowerCase().includes(normalizedQuery) ||
        movimento.evento_nome.toLowerCase().includes(normalizedQuery) ||
        movimento.numero_fatura?.toLowerCase().includes(normalizedQuery);
      const matchesPago =
        activeTab === "entrada" ||
        pago === "todos" ||
        (pago === "sim" && movimento.pago === true) ||
        (pago === "nao" && movimento.pago === false);
      const matchesEvent = selectedSlug === "todos" || movimento.evento_slug === selectedSlug;
      return matchesTab && matchesQuery && matchesPago && matchesEvent;
    });
  }, [activeTab, movimentos, normalizedQuery, pago, selectedSlug]);

  const orderedEventos = useMemo(() => {
    return [...eventos].sort((a, b) => {
      const balanceDelta = Number(b.saldo ?? 0) - Number(a.saldo ?? 0);
      return balanceDelta || a.ordem_folha - b.ordem_folha;
    });
  }, [eventos]);

  const resetFilters = () => {
    setQuery("");
    setPago("todos");
    setSelectedSlug("todos");
  };

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Q26</p>
          <h1>Tesouraria</h1>
        </div>
        <div className="status">
          <span className="status-dot" />
          Supabase
        </div>
      </section>

      {error ? <section className="notice">Não consegui ligar ao Supabase. {error}</section> : null}

      <section className="metrics" aria-label="Resumo financeiro">
        <article>
          <span>Entradas</span>
          <strong>{formatMoney(totals.entradas)}</strong>
        </article>
        <article>
          <span>Saídas</span>
          <strong>{formatMoney(totals.saidas)}</strong>
        </article>
        <article>
          <span>Saldo</span>
          <strong>{formatMoney(totals.entradas - totals.saidas)}</strong>
        </article>
        <article>
          <span>Movimentos</span>
          <strong>{totals.movimentos}</strong>
        </article>
      </section>

      <section className="controls" aria-label="Filtros">
        <div className="tabs" role="tablist" aria-label="Tipo de movimento">
          <button
            aria-selected={activeTab === "entrada"}
            className={activeTab === "entrada" ? "tab active" : "tab"}
            onClick={() => setActiveTab("entrada")}
            role="tab"
            type="button"
          >
            <span>Entradas</span>
            <strong>{tabCounts.entradas}</strong>
          </button>
          <button
            aria-selected={activeTab === "saida"}
            className={activeTab === "saida" ? "tab active" : "tab"}
            onClick={() => setActiveTab("saida")}
            role="tab"
            type="button"
          >
            <span>Saídas</span>
            <strong>{tabCounts.saidas}</strong>
          </button>
        </div>
        <label>
          Pesquisa
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Evento, item ou fatura"
          />
        </label>
        <label>
          Pago
          <select
            disabled={activeTab === "entrada"}
            value={pago}
            onChange={(event) => setPago(event.target.value as typeof pago)}
          >
            <option value="todos">Todos</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </label>
        <button type="button" onClick={resetFilters}>
          Limpar
        </button>
      </section>

      <section className="workspace">
        <aside className="event-list" aria-label="Eventos e categorias">
          <button
            className={selectedSlug === "todos" ? "event-card selected" : "event-card"}
            type="button"
            onClick={() => setSelectedSlug("todos")}
          >
            <span className="event-name">Todos os movimentos</span>
            <span className="event-meta">{eventos.length} folhas</span>
          </button>
          {orderedEventos.map((event) => (
            <button
              className={selectedSlug === event.slug ? "event-card selected" : "event-card"}
              key={event.slug}
              type="button"
              onClick={() => setSelectedSlug(event.slug)}
            >
              <span className="event-name">{event.nome}</span>
              <span className="event-meta">
                {event.tipo === "evento" ? formatDate(event.data_inicio) : "Categoria"}
              </span>
              <span className={Number(event.saldo) >= 0 ? "event-balance positive" : "event-balance negative"}>
                {formatMoney(event.saldo)}
              </span>
            </button>
          ))}
        </aside>

        <section className="table-panel" aria-label="Movimentos">
          <div className="table-heading">
            <div>
              <p className="eyebrow">{activeTab === "entrada" ? "Entradas" : "Saídas"}</p>
              <h2>{filteredMovimentos.length} registos</h2>
            </div>
            <span>{formatMoney(filteredMovimentos.reduce((sum, item) => sum + Number(item.montante ?? 0), 0))}</span>
          </div>

          <div className="table-wrap">
            <table className={activeTab === "entrada" ? "entries-table" : "outgoing-table"}>
              <thead>
                {activeTab === "entrada" ? (
                  <tr>
                    <th>Evento</th>
                    <th>Item</th>
                    <th>Montante</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Evento</th>
                    <th>Tipo</th>
                    <th>Item</th>
                    <th>Data</th>
                    <th>Montante</th>
                    <th>Pagamento</th>
                    <th>Fatura</th>
                    <th>Pago</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {filteredMovimentos.map((movimento) => (
                  activeTab === "entrada" ? (
                    <tr key={movimento.id}>
                      <td>{movimento.evento_nome}</td>
                      <td className="item-cell">{movimento.item}</td>
                      <td className="money">{formatMoney(movimento.montante)}</td>
                    </tr>
                  ) : (
                    <tr key={movimento.id}>
                      <td>{movimento.evento_nome}</td>
                      <td>
                        <span className={`pill ${movimento.tipo}`}>{movementLabel(movimento.tipo)}</span>
                      </td>
                      <td className="item-cell">{movimento.item}</td>
                      <td>{formatDate(movimento.data_pagamento)}</td>
                      <td className="money">{formatMoney(movimento.montante)}</td>
                      <td>{movimento.tipo_pagamento ?? "—"}</td>
                      <td>{movimento.numero_fatura ?? "—"}</td>
                      <td>{movimento.pago === null ? "—" : movimento.pago ? "Sim" : "Não"}</td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

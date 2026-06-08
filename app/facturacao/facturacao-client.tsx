"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ROLE_LABELS, canAccessAdmin, type AuthSession } from "../auth-types";
import type { EventoResumo, MovimentoDetalhe } from "../supabase-data";

type FacturacaoClientProps = {
  eventos: EventoResumo[];
  movimentos: MovimentoDetalhe[];
  error: string | null;
  session: AuthSession;
};

type DescriptionPopup = {
  title: string;
  text: string;
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

function parseAmount(value: string) {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return 0;
  if (normalized.includes(",") && normalized.includes(".")) {
    return Number(normalized.replace(/\./g, "").replace(",", "."));
  }
  if (normalized.includes(",")) return Number(normalized.replace(",", "."));
  return Number(normalized);
}

function isMovementCounted(movimento: MovimentoDetalhe) {
  return movimento.contabilizar_totais !== false;
}

function isFaturadaDespesa(movimento: MovimentoDetalhe) {
  return (
    movimento.tipo === "saida" &&
    movimento.fatura_com_nif === true &&
    movimento.evento_slug !== "contas" &&
    isMovementCounted(movimento)
  );
}

function movementAmount(movimento: MovimentoDetalhe) {
  return Number(movimento.montante ?? 0);
}

export function FacturacaoClient({ eventos, movimentos, error, session }: FacturacaoClientProps) {
  const eventList = useMemo(() => {
    return eventos
      .filter((event) => event.slug !== "contas")
      .sort((a, b) => {
        const aTime = a.data_inicio ? new Date(`${a.data_inicio}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.data_inicio ? new Date(`${b.data_inicio}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime || a.ordem_folha - b.ordem_folha;
      });
  }, [eventos]);

  const [selectedSlug, setSelectedSlug] = useState(() => eventList[0]?.slug ?? "");
  const [invoiceValue, setInvoiceValue] = useState("");
  const [selectedPreviousIds, setSelectedPreviousIds] = useState<Set<string>>(new Set());
  const [descriptionPopup, setDescriptionPopup] = useState<DescriptionPopup | null>(null);

  const selectedEvent = useMemo(() => {
    return eventList.find((event) => event.slug === selectedSlug) ?? eventList[0] ?? null;
  }, [eventList, selectedSlug]);

  const eventPositions = useMemo(() => {
    return new Map(eventList.map((event, index) => [event.slug, index]));
  }, [eventList]);

  const currentEventExpenses = useMemo(() => {
    if (!selectedEvent) return [];
    return movimentos
      .filter((movimento) => movimento.evento_slug === selectedEvent.slug && isFaturadaDespesa(movimento))
      .sort((a, b) => (a.data_pagamento ?? "").localeCompare(b.data_pagamento ?? "") || a.item.localeCompare(b.item));
  }, [movimentos, selectedEvent]);

  const previousExpenses = useMemo(() => {
    if (!selectedEvent) return [];
    const selectedPosition = eventPositions.get(selectedEvent.slug) ?? 0;
    return movimentos
      .filter((movimento) => {
        const movementPosition = eventPositions.get(movimento.evento_slug);
        return (
          isFaturadaDespesa(movimento) &&
          movimento.evento_slug !== selectedEvent.slug &&
          typeof movementPosition === "number" &&
          movementPosition < selectedPosition
        );
      })
      .sort((a, b) => (b.data_pagamento ?? "").localeCompare(a.data_pagamento ?? "") || a.evento_nome.localeCompare(b.evento_nome));
  }, [eventPositions, movimentos, selectedEvent]);

  const selectedPreviousExpenses = useMemo(() => {
    return previousExpenses.filter((movimento) => selectedPreviousIds.has(movimento.id));
  }, [previousExpenses, selectedPreviousIds]);

  const currentExpensesTotal = currentEventExpenses.reduce((sum, movimento) => sum + movementAmount(movimento), 0);
  const previousExpensesTotal = selectedPreviousExpenses.reduce((sum, movimento) => sum + movementAmount(movimento), 0);
  const billedExpensesTotal = currentExpensesTotal + previousExpensesTotal;
  const invoiceAmount = parseAmount(invoiceValue);
  const invoiceDifference = billedExpensesTotal - (Number.isFinite(invoiceAmount) ? invoiceAmount : 0);

  const togglePreviousExpense = (id: string) => {
    setSelectedPreviousIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectEvent = (slug: string) => {
    setSelectedSlug(slug);
    setSelectedPreviousIds(new Set());
  };

  const renderDescription = (movimento: MovimentoDetalhe) => {
    if (!movimento.descricao) return "-";
    return (
      <button
        className="description-button"
        type="button"
        onClick={() => setDescriptionPopup({ title: movimento.item, text: movimento.descricao ?? "" })}
      >
        {movimento.descricao}
      </button>
    );
  };

  return (
    <main className="shell billing-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Q26</p>
          <h1>Facturação</h1>
        </div>
        <div className="top-actions">
          {canAccessAdmin(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/admin">
              Admin
            </Link>
          ) : null}
          <Link className="nav-button secondary-nav-button" href="/">
            Tesouraria
          </Link>
          <Link className="nav-button secondary-nav-button" href="/reports">
            Relatórios
          </Link>
          <Link className="nav-button" href="/overview">
            OverView
          </Link>
          <div className="user-chip">
            <span>{session.username}</span>
            <strong>{ROLE_LABELS[session.role]}</strong>
          </div>
          <form action="/api/logout" method="post">
            <button className="logout-button" type="submit">
              Sair
            </button>
          </form>
          <div className="status">
            <span className="status-dot" />
            Supabase
          </div>
        </div>
      </section>

      {error ? <section className="notice">Não consegui ligar ao Supabase. {error}</section> : null}

      <section className="billing-controls" aria-label="Dados da faturação">
        <label>
          Evento
          <select value={selectedEvent?.slug ?? ""} onChange={(event) => selectEvent(event.target.value)}>
            {eventList.map((event) => (
              <option key={event.slug} value={event.slug}>
                {event.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor da fatura
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={invoiceValue}
            onChange={(event) => setInvoiceValue(event.target.value)}
          />
        </label>
      </section>

      <section className="metrics billing-metrics" aria-label="Resumo de faturação">
        <article>
          <span>Despesas faturadas</span>
          <strong>{formatMoney(currentExpensesTotal)}</strong>
        </article>
        <article>
          <span>Itens anteriores</span>
          <strong>{formatMoney(previousExpensesTotal)}</strong>
        </article>
        <article>
          <span>Total faturado</span>
          <strong>{formatMoney(billedExpensesTotal)}</strong>
        </article>
        <article>
          <span>Valor da fatura</span>
          <strong>{formatMoney(Number.isFinite(invoiceAmount) ? invoiceAmount : 0)}</strong>
        </article>
        <article>
          <span>Dif. Despesa/Fatura</span>
          <strong className={invoiceDifference >= 0 ? "positive" : "negative"}>{formatMoney(invoiceDifference)}</strong>
        </article>
      </section>

      <section className="billing-grid">
        <article className="billing-panel">
          <div className="table-heading">
            <div>
              <p className="eyebrow">{selectedEvent ? formatDate(selectedEvent.data_inicio) : "Evento"}</p>
              <h2>{selectedEvent?.nome ?? "Sem evento"}</h2>
            </div>
            <span>{currentEventExpenses.length} itens</span>
          </div>
          <div className="table-wrap billing-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Descrição</th>
                  <th>Data</th>
                  <th>Pagamento</th>
                  <th>Montante</th>
                </tr>
              </thead>
              <tbody>
                {currentEventExpenses.length ? (
                  currentEventExpenses.map((movimento) => (
                    <tr key={movimento.id}>
                      <td>{movimento.item}</td>
                      <td>{renderDescription(movimento)}</td>
                      <td>{formatDate(movimento.data_pagamento)}</td>
                      <td>{movimento.tipo_pagamento ?? "-"}</td>
                      <td>{formatMoney(movimento.montante)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-movement-row" colSpan={5}>
                      Sem despesas com Fatura C/NIF neste evento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="billing-panel">
          <div className="table-heading">
            <div>
              <p className="eyebrow">Eventos anteriores</p>
              <h2>Itens a acrescentar</h2>
            </div>
            <span>{selectedPreviousExpenses.length} selecionados</span>
          </div>
          <div className="table-wrap billing-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Selecionar</th>
                  <th>Evento</th>
                  <th>Item</th>
                  <th>Descrição</th>
                  <th>Montante</th>
                </tr>
              </thead>
              <tbody>
                {previousExpenses.length ? (
                  previousExpenses.map((movimento) => (
                    <tr key={movimento.id}>
                      <td>
                        <input
                          aria-label={`Selecionar ${movimento.item}`}
                          checked={selectedPreviousIds.has(movimento.id)}
                          type="checkbox"
                          onChange={() => togglePreviousExpense(movimento.id)}
                        />
                      </td>
                      <td>{movimento.evento_nome}</td>
                      <td>{movimento.item}</td>
                      <td>{renderDescription(movimento)}</td>
                      <td>{formatMoney(movimento.montante)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-movement-row" colSpan={5}>
                      Sem itens faturados em eventos anteriores.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {descriptionPopup ? (
        <div className="modal-backdrop" role="presentation">
          <section aria-modal="true" className="modal description-modal" role="dialog">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Descrição</p>
                <h2>{descriptionPopup.title}</h2>
              </div>
              <button aria-label="Fechar" className="icon-button" onClick={() => setDescriptionPopup(null)} type="button">
                ×
              </button>
            </div>
            <p className="description-full-text">{descriptionPopup.text}</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setDescriptionPopup(null)}>
                Fechar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

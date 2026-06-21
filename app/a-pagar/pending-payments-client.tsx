"use client";

import { useMemo, useState } from "react";
import type { AuthSession } from "../auth-types";
import type { MovimentoDetalhe } from "../supabase-data";

type PendingPaymentsClientProps = {
  initialMovimentos: MovimentoDetalhe[];
  role: AuthSession["role"];
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
  if (tipo === "saida") return "Saída";
  return "A pagamento";
}

export function PendingPaymentsClient({ initialMovimentos, role }: PendingPaymentsClientProps) {
  const [movimentos, setMovimentos] = useState(initialMovimentos);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pendingTotal = useMemo(
    () => movimentos.reduce((sum, movimento) => sum + Number(movimento.montante ?? 0), 0),
    [movimentos]
  );

  const updatePaid = async (movimento: MovimentoDetalhe, value: string) => {
    if (value !== "sim") return;

    let justification = "";
    if (role === "operator") {
      const answer = window.prompt("Justificação para marcar como pago:");
      if (!answer?.trim()) {
        setMessage("A alteração precisa de justificação.");
        return;
      }
      justification = answer.trim();
    }

    setSavingId(movimento.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/movimentos/${movimento.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pago: true,
          raw: {
            ...(movimento.raw ?? {}),
            faturar_mais_tarde: false,
            pago_atualizado: {
              data: new Date().toISOString(),
              origem: "pagina_a_pagar"
            }
          },
          ...(justification ? { justification } : {})
        })
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível atualizar.");

      setMovimentos((current) => current.filter((item) => item.id !== movimento.id));
      setMessage("Estado Pago atualizado e Faturar mais tarde removido.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      {message ? <section className="notice">{message}</section> : null}

      <section className="metrics pending-metrics" aria-label="Resumo de pagamentos em falta">
        <article>
          <span>Pagamentos em falta</span>
          <strong>{movimentos.length}</strong>
        </article>
        <article>
          <span>Total em falta</span>
          <strong>{formatMoney(pendingTotal)}</strong>
        </article>
      </section>

      <section className="table-panel" aria-label="Registos com pagamentos em falta">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Consulta</p>
            <h2>Registos com pagamento em falta</h2>
          </div>
          <span>{formatMoney(pendingTotal)}</span>
        </div>

        <div className="table-wrap pending-table-wrap">
          <table className="outgoing-table pending-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Tipo</th>
                <th>Item</th>
                <th>Descrição</th>
                <th>Data</th>
                <th>Montante</th>
                <th>Pagamento</th>
                <th>Fatura</th>
                <th>Fatura C/NIF</th>
                <th>Pago</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.length ? (
                movimentos.map((movimento) => (
                  <tr className="pending-payment-row" key={movimento.id}>
                    <td>{movimento.evento_nome}</td>
                    <td>{movementLabel(movimento.tipo)}</td>
                    <td className="item-cell">{movimento.item}</td>
                    <td>{movimento.descricao ?? "-"}</td>
                    <td>{formatDate(movimento.data_pagamento)}</td>
                    <td className="money">{formatMoney(movimento.montante)}</td>
                    <td>{movimento.tipo_pagamento ?? "-"}</td>
                    <td>{movimento.numero_fatura ?? "-"}</td>
                    <td>{movimento.fatura_com_nif === null ? "-" : movimento.fatura_com_nif ? "Sim" : "Não"}</td>
                    <td>
                      <select
                        className="pending-paid-select"
                        disabled={savingId === movimento.id}
                        value="nao"
                        onChange={(event) => updatePaid(movimento, event.target.value)}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty-movement-row" colSpan={10}>
                    Não existem pagamentos em falta.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

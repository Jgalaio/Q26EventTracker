"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AppLogo } from "../app-settings";
import { ROLE_LABELS, canAccessAdmin, type AuthSession } from "../auth-types";
import { NotesMenu } from "../notes-menu";
import type { MovimentoDetalhe } from "../supabase-data";
import { TopbarBrand } from "../topbar-brand";

type FatPatrociniosClientProps = {
  initialMovimentos: MovimentoDetalhe[];
  error: string | null;
  session: AuthSession;
  appLogo: AppLogo | null;
};

type InvoiceFile = {
  fileName: string;
  dataUrl: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  uploadedBy?: string;
};

type SelectedFile = {
  fileName: string;
  dataUrl: string;
  contentType: string;
  size: number;
};

const MAX_FILE_DATA_URL_LENGTH = 2_500_000;

const moneyFormatter = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2
});

function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(Number(value ?? 0));
}

function isRawFlagEnabled(value: unknown) {
  return value === true || value === "sim" || value === "true";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInvoiceIssued(movimento: MovimentoDetalhe) {
  return isRawFlagEnabled(movimento.raw?.fatura_emitida);
}

function isInvoiceFile(value: unknown): value is InvoiceFile {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as InvoiceFile).fileName === "string" &&
    typeof (value as InvoiceFile).dataUrl === "string"
  );
}

function invoiceFile(movimento: MovimentoDetalhe) {
  const direct = movimento.raw?.fatura_patrocinio;
  if (isInvoiceFile(direct)) return direct;

  const legacy = movimento.raw?.ficheiro_fatura_patrocinio;
  return isInvoiceFile(legacy) ? legacy : null;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Ficheiro inválido.")));
    reader.onerror = () => reject(new Error("Não consegui ler o ficheiro."));
    reader.readAsDataURL(file);
  });
}

export function FatPatrociniosClient({ initialMovimentos, error, session, appLogo }: FatPatrociniosClientProps) {
  const [movimentos, setMovimentos] = useState(initialMovimentos);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, "sim" | "nao">>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, SelectedFile>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const totals = useMemo(() => {
    return movimentos.reduce(
      (acc, movimento) => {
        acc.total += Number(movimento.montante ?? 0);
        if (isInvoiceIssued(movimento)) {
          acc.emitidas += 1;
          acc.totalEmitido += Number(movimento.montante ?? 0);
        } else {
          acc.porEmitir += 1;
          acc.totalPorEmitir += Number(movimento.montante ?? 0);
        }
        return acc;
      },
      { emitidas: 0, porEmitir: 0, total: 0, totalEmitido: 0, totalPorEmitir: 0 }
    );
  }, [movimentos]);

  const askJustification = () => {
    if (session.role !== "operator") return "";
    const answer = window.prompt("Justificação da alteração:");
    if (!answer?.trim()) {
      setMessage("A alteração precisa de justificação.");
      return null;
    }
    return answer.trim();
  };

  const updateMovement = async (movimento: MovimentoDetalhe, raw: Record<string, unknown>, justification?: string) => {
    const response = await fetch(`/api/movimentos/${movimento.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw,
        ...(justification ? { justification } : {})
      })
    });
    const body = (await response.json().catch(() => null)) as MovimentoDetalhe[] | { message?: string } | null;
    if (!response.ok) {
      const message = body && !Array.isArray(body) ? body.message : null;
      throw new Error(message ?? "Não foi possível atualizar.");
    }

    const responseRow = Array.isArray(body) ? body[0] : null;
    const responseRaw = isRecord(responseRow) && isRecord(responseRow.raw) ? responseRow.raw : raw;
    return { ...movimento, raw: responseRaw };
  };

  const changeStatus = async (movimento: MovimentoDetalhe, value: "sim" | "nao") => {
    setMessage(null);

    if (value === "sim") {
      setStatusDrafts((current) => ({ ...current, [movimento.id]: value }));
      return;
    }

    const justification = askJustification();
    if (justification === null) return;

    setSavingId(movimento.id);
    try {
      const updated = await updateMovement(
        movimento,
        {
          ...(movimento.raw ?? {}),
          patrocinio: true,
          tipo_entrada: "Patrocínio",
          fatura_emitida: false,
          fatura_patrocinio_atualizada_em: new Date().toISOString()
        },
        justification
      );
      setMovimentos((current) => current.map((item) => (item.id === movimento.id ? updated : item)));
      setSelectedFiles((current) => {
        const next = { ...current };
        delete next[movimento.id];
        return next;
      });
      setStatusDrafts((current) => ({ ...current, [movimento.id]: "nao" }));
      setMessage("Estado atualizado para por emitir.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível atualizar.");
    } finally {
      setSavingId(null);
    }
  };

  const selectFile = async (movimento: MovimentoDetalhe, file: File | null) => {
    if (!file) return;
    setMessage(null);

    const fileName = file.name.toLowerCase();
    const isPdf = file.type.startsWith("application/pdf") || fileName.endsWith(".pdf");
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      setMessage("Usa um ficheiro PDF ou imagem.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > MAX_FILE_DATA_URL_LENGTH) {
        setMessage("O ficheiro é demasiado pesado. Usa um PDF/imagem mais pequeno.");
        return;
      }
      setSelectedFiles((current) => ({
        ...current,
        [movimento.id]: {
          fileName: file.name,
          dataUrl,
          contentType: file.type || "application/octet-stream",
          size: file.size
        }
      }));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não consegui ler o ficheiro.");
    }
  };

  const saveIssuedInvoice = async (movimento: MovimentoDetalhe) => {
    const selectedFile = selectedFiles[movimento.id];
    const existingFile = invoiceFile(movimento);
    if (!selectedFile && !existingFile) {
      setMessage("Escolhe o ficheiro da fatura para marcar como emitida.");
      return;
    }

    const justification = askJustification();
    if (justification === null) return;

    setSavingId(movimento.id);
    setMessage(null);
    try {
      const now = new Date().toISOString();
      const updated = await updateMovement(
        movimento,
        {
          ...(movimento.raw ?? {}),
          patrocinio: true,
          tipo_entrada: "Patrocínio",
          fatura_emitida: true,
          fatura_patrocinio: selectedFile
            ? {
                ...selectedFile,
                uploadedAt: now,
                uploadedBy: session.username
              }
            : existingFile,
          fatura_patrocinio_atualizada_em: now
        },
        justification
      );

      setMovimentos((current) => current.map((item) => (item.id === movimento.id ? updated : item)));
      setSelectedFiles((current) => {
        const next = { ...current };
        delete next[movimento.id];
        return next;
      });
      setStatusDrafts((current) => ({ ...current, [movimento.id]: "sim" }));
      setMessage("Fatura marcada como emitida.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível guardar.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="shell sponsor-invoices-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Fat. Patrocínios" />
        <div className="top-actions">
          <NotesMenu role={session.role} />
          {canAccessAdmin(session.role) ? (
            <Link className="nav-button secondary-nav-button" href="/admin">
              Admin
            </Link>
          ) : null}
          <Link className="nav-button secondary-nav-button" href="/">
            Tesouraria
          </Link>
          <Link className="nav-button secondary-nav-button" href="/facturacao">
            Faturação
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
        </div>
      </section>

      {error ? <section className="notice">Não consegui ligar ao Supabase. {error}</section> : null}
      {message ? <section className="notice">{message}</section> : null}

      <section className="metrics sponsor-invoice-metrics" aria-label="Resumo de faturas de patrocínios">
        <article>
          <span>Patrocínios</span>
          <strong>{movimentos.length}</strong>
        </article>
        <article>
          <span>Por emitir</span>
          <strong>{totals.porEmitir}</strong>
          <small>{formatMoney(totals.totalPorEmitir)}</small>
        </article>
        <article>
          <span>Emitidas</span>
          <strong>{totals.emitidas}</strong>
          <small>{formatMoney(totals.totalEmitido)}</small>
        </article>
        <article>
          <span>Total</span>
          <strong>{formatMoney(totals.total)}</strong>
        </article>
      </section>

      <section className="table-panel sponsor-invoice-panel" aria-label="Faturas de patrocínios">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Patrocínios</p>
            <h2>Faturas a emitir ou emitidas</h2>
          </div>
          <span>{formatMoney(totals.total)}</span>
        </div>

        <div className="table-wrap sponsor-invoice-table-wrap">
          <table className="outgoing-table sponsor-invoice-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Item</th>
                <th>Método</th>
                <th>Montante</th>
                <th>Estado</th>
                <th>Ficheiro</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.length ? (
                movimentos.map((movimento) => {
                  const issued = isInvoiceIssued(movimento);
                  const draftStatus = statusDrafts[movimento.id] ?? (issued ? "sim" : "nao");
                  const attachment = invoiceFile(movimento);
                  const selectedFile = selectedFiles[movimento.id];
                  const showUpload = draftStatus === "sim" && (!attachment || selectedFile);
                  const shouldShowSave = draftStatus === "sim" && (!issued || !attachment || Boolean(selectedFile));

                  return (
                    <tr key={movimento.id}>
                      <td>{movimento.evento_nome}</td>
                      <td className="item-cell">{movimento.item}</td>
                      <td>{movimento.tipo_pagamento ?? "-"}</td>
                      <td className="money">{formatMoney(movimento.montante)}</td>
                      <td>
                        <select
                          className={draftStatus === "sim" ? "invoice-status-select issued" : "invoice-status-select pending"}
                          disabled={savingId === movimento.id}
                          value={draftStatus}
                          onChange={(event) => changeStatus(movimento, event.target.value as "sim" | "nao")}
                        >
                          <option value="nao">Por emitir</option>
                          <option value="sim">Emitida</option>
                        </select>
                      </td>
                      <td>
                        <div className="invoice-file-cell">
                          {attachment ? (
                            <a download={attachment.fileName} href={attachment.dataUrl} target="_blank" rel="noreferrer">
                              {attachment.fileName}
                            </a>
                          ) : (
                            <span>Sem ficheiro</span>
                          )}
                          {selectedFile ? <small>Novo: {selectedFile.fileName}</small> : null}
                          {showUpload ? (
                            <input
                              accept="application/pdf,image/*"
                              disabled={savingId === movimento.id}
                              type="file"
                              onChange={(event) => selectFile(movimento, event.target.files?.[0] ?? null)}
                            />
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          {shouldShowSave ? (
                            <button disabled={savingId === movimento.id} type="button" onClick={() => saveIssuedInvoice(movimento)}>
                              {attachment ? "Guardar" : issued ? "Anexar" : "Emitir"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="empty-movement-row" colSpan={7}>
                    Não existem patrocínios registados para faturação.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

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

type InvoiceGroup = "patrocinios" | "faturacao";

type InvoiceTotals = {
  emitidas: number;
  porEmitir: number;
  total: number;
  totalEmitido: number;
  totalPorEmitir: number;
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

function normalizeEntryKind(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isSponsorEntry(movimento: MovimentoDetalhe) {
  return normalizeEntryKind(movimento.raw?.tipo_entrada) === "patrocinio" || isRawFlagEnabled(movimento.raw?.patrocinio);
}

function entryKindLabel(movimento: MovimentoDetalhe) {
  return isSponsorEntry(movimento) ? "Patrocínio" : "Faturação";
}

function invoiceTrackingRaw(movimento: MovimentoDetalhe, issued: boolean, extra: Record<string, unknown> = {}) {
  const sponsor = isSponsorEntry(movimento);
  return {
    ...(movimento.raw ?? {}),
    patrocinio: sponsor,
    precisa_fatura: sponsor ? movimento.raw?.precisa_fatura ?? false : true,
    tipo_entrada: sponsor ? "Patrocínio" : "Faturação",
    fatura_emitida: issued,
    fatura_patrocinio_atualizada_em: new Date().toISOString(),
    ...extra
  };
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

function summarizeInvoices(items: MovimentoDetalhe[]): InvoiceTotals {
  return items.reduce(
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
}

export function FatPatrociniosClient({ initialMovimentos, error, session, appLogo }: FatPatrociniosClientProps) {
  const [movimentos, setMovimentos] = useState(initialMovimentos);
  const [statusDrafts, setStatusDrafts] = useState<Record<string, "sim" | "nao">>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, SelectedFile>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<InvoiceGroup, boolean>>({
    patrocinios: false,
    faturacao: false
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sponsorMovimentos = useMemo(() => movimentos.filter(isSponsorEntry), [movimentos]);
  const billingMovimentos = useMemo(() => movimentos.filter((movimento) => !isSponsorEntry(movimento)), [movimentos]);
  const totals = useMemo(() => summarizeInvoices(movimentos), [movimentos]);
  const sponsorTotals = useMemo(() => summarizeInvoices(sponsorMovimentos), [sponsorMovimentos]);
  const billingTotals = useMemo(() => summarizeInvoices(billingMovimentos), [billingMovimentos]);

  const toggleGroup = (group: InvoiceGroup) => {
    setCollapsedGroups((current) => ({
      ...current,
      [group]: !current[group]
    }));
  };

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
        invoiceTrackingRaw(movimento, false),
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
        invoiceTrackingRaw(movimento, true, {
          fatura_patrocinio: selectedFile
            ? {
                ...selectedFile,
                uploadedAt: now,
                uploadedBy: session.username
              }
            : existingFile,
          fatura_patrocinio_atualizada_em: now
        }),
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

  const renderInvoiceTable = (items: MovimentoDetalhe[], emptyText: string) => (
    <div className="table-wrap sponsor-invoice-table-wrap">
      <table className="outgoing-table sponsor-invoice-table">
        <thead>
          <tr>
            <th>Evento</th>
            <th>Item</th>
            <th>Método</th>
            <th>Tipo</th>
            <th>Montante</th>
            <th>Estado</th>
            <th>Ficheiro</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.length ? (
            items.map((movimento) => {
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
                  <td>{entryKindLabel(movimento)}</td>
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
              <td className="empty-movement-row" colSpan={8}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderInvoiceSection = (
    group: InvoiceGroup,
    eyebrow: string,
    title: string,
    items: MovimentoDetalhe[],
    sectionTotals: InvoiceTotals,
    emptyText: string
  ) => {
    const collapsed = collapsedGroups[group];

    return (
      <section className="table-panel sponsor-invoice-panel invoice-collapsible-panel" aria-label={title}>
        <button
          aria-expanded={!collapsed}
          className="invoice-section-toggle"
          onClick={() => toggleGroup(group)}
          type="button"
        >
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <div className="invoice-section-summary">
            <span>{items.length} registos</span>
            <strong>{formatMoney(sectionTotals.total)}</strong>
            <small>{collapsed ? "Abrir" : "Fechar"}</small>
          </div>
        </button>
        {collapsed ? null : renderInvoiceTable(items, emptyText)}
      </section>
    );
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
          <Link className="nav-button secondary-nav-button" href="/pesquisa">
            Pesquisa
          </Link>
          <Link className="nav-button secondary-nav-button" href="/facturacao">
            Fat.Finanças
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

      <section className="metrics sponsor-invoice-metrics" aria-label="Resumo de faturas de entradas">
        <article>
          <span>Entradas</span>
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

      <section className="invoice-groups" aria-label="Faturas por tipo">
        {renderInvoiceSection(
          "patrocinios",
          "Patrocínios",
          "Faturas de patrocínios",
          sponsorMovimentos,
          sponsorTotals,
          "Não existem patrocínios registados para emissão de fatura."
        )}
        {renderInvoiceSection(
          "faturacao",
          "Faturação",
          "Faturas de faturação",
          billingMovimentos,
          billingTotals,
          "Não existem entradas de faturação marcadas como precisa de fatura."
        )}
      </section>
    </main>
  );
}

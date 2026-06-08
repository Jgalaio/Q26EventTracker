"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EventoResumo, MovimentoDetalhe } from "./supabase-data";

type DashboardProps = {
  eventos: EventoResumo[];
  movimentos: MovimentoDetalhe[];
  error: string | null;
};

type ModalMode = "create-event" | "edit-event" | "add-entry" | "add-exit" | "edit-entry" | "edit-exit" | null;
type SectionMode = "eventos" | "contas";

type EventForm = {
  nome: string;
  data_inicio: string;
  data_fim: string;
  isento: "sim" | "nao";
  tipo: "evento" | "categoria";
};

type MovementForm = {
  item: string;
  montante: string;
  data_pagamento: string;
  numero_fatura: string;
  fatura_com_nif: "" | "sim" | "nao";
  tipo_pagamento: string;
  pago: "" | "sim" | "nao";
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ushhacwtmpmwmvpaitdx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";

const emptyEventForm: EventForm = {
  nome: "",
  data_inicio: "",
  data_fim: "",
  isento: "nao",
  tipo: "evento"
};

const emptyMovementForm: MovementForm = {
  item: "",
  montante: "",
  data_pagamento: "",
  numero_fatura: "",
  fatura_com_nif: "",
  tipo_pagamento: "",
  pago: "sim"
};

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

function isEventIsento(event: EventoResumo) {
  if (typeof event.isento === "boolean") return event.isento;
  const value = event.isento_texto?.trim().toLowerCase();
  return value === "sim";
}

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "evento"
  );
}

function nextAvailableSlug(name: string, existingSlugs: string[]) {
  const base = slugify(name);
  let slug = base;
  let counter = 2;
  while (existingSlugs.includes(slug)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return slug;
}

function optionalBoolean(value: "" | "sim" | "nao") {
  if (value === "sim") return true;
  if (value === "nao") return false;
  return null;
}

function booleanToForm(value: boolean | null): "" | "sim" | "nao" {
  if (value === true) return "sim";
  if (value === false) return "nao";
  return "";
}

function normalizePayment(value: string | null | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim() ?? "";
}

function isContaPayment(value: string | null) {
  const normalized = normalizePayment(value);
  return normalized === "transferencia" || normalized === "c q26";
}

function numericAmount(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function manualOrigin(prefix: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `app_${prefix}_${id}`;
}

async function supabaseWrite(resource: string, options: RequestInit) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`, {
    ...options,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export function Dashboard({ eventos, movimentos, error }: DashboardProps) {
  const router = useRouter();
  const [sectionMode, setSectionMode] = useState<SectionMode>("eventos");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"entrada" | "saida">("entrada");
  const [pago, setPago] = useState<"todos" | "sim" | "nao">("todos");
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm);
  const [movementForm, setMovementForm] = useState<MovementForm>(emptyMovementForm);
  const [selectedMovement, setSelectedMovement] = useState<MovimentoDetalhe | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const accountEvent = useMemo(() => {
    return eventos.find((event) => event.slug === "contas") ?? null;
  }, [eventos]);

  const eventOnlyList = useMemo(() => {
    return eventos.filter((event) => event.slug !== "contas");
  }, [eventos]);

  const totals = useMemo(() => {
    return eventOnlyList.reduce(
      (acc, event) => {
        acc.entradas += Number(event.total_entradas ?? 0);
        acc.saidas += Number(event.total_saidas ?? 0);
        acc.aPagamento += Number(event.total_a_pagamento ?? 0);
        acc.movimentos += Number(event.total_movimentos ?? 0);
        if (isEventIsento(event)) acc.isentos += 1;
        return acc;
      },
      { entradas: 0, saidas: 0, aPagamento: 0, movimentos: 0, isentos: 0 }
    );
  }, [eventOnlyList]);

  const orderedEventos = useMemo(() => {
    return [...eventOnlyList].sort((a, b) => {
      const balanceDelta = Number(b.saldo ?? 0) - Number(a.saldo ?? 0);
      return balanceDelta || a.ordem_folha - b.ordem_folha;
    });
  }, [eventOnlyList]);

  const selectedEvent = useMemo(() => {
    return orderedEventos.find((event) => event.slug === selectedSlug) ?? orderedEventos[0] ?? null;
  }, [orderedEventos, selectedSlug]);

  const eventMovimentos = useMemo(() => {
    if (!selectedEvent) return [];
    return movimentos.filter((movimento) => movimento.evento_slug === selectedEvent.slug);
  }, [movimentos, selectedEvent]);

  const normalizedQuery = query.trim().toLowerCase();
  const tabCounts = useMemo(() => {
    return eventMovimentos.reduce(
      (acc, movimento) => {
        if (movimento.tipo === "entrada") {
          acc.entradas += 1;
          acc.totalEntradas += Number(movimento.montante ?? 0);
        } else {
          acc.saidas += 1;
          acc.totalSaidas += Number(movimento.montante ?? 0);
        }
        return acc;
      },
      { entradas: 0, saidas: 0, totalEntradas: 0, totalSaidas: 0 }
    );
  }, [eventMovimentos]);

  const eventFinancialSummary = useMemo(() => {
    return eventMovimentos.reduce(
      (acc, movimento) => {
        const amount = Number(movimento.montante ?? 0);
        if (movimento.tipo === "entrada") {
          acc.entradas += amount;
          return acc;
        }

        acc.saidas += amount;
        if (movimento.fatura_com_nif === true) acc.faturado += amount;
        if (movimento.fatura_com_nif === false) acc.naoFaturado += amount;

        const payment = normalizePayment(movimento.tipo_pagamento);
        if (payment === "c q26") acc.pagoQ26 += amount;
        if (payment === "transferencia") acc.transferencia += amount;
        if (payment === "dinheiro") acc.dinheiro += amount;
        return acc;
      },
      {
        entradas: 0,
        saidas: 0,
        faturado: 0,
        naoFaturado: 0,
        pagoQ26: 0,
        transferencia: 0,
        dinheiro: 0
      }
    );
  }, [eventMovimentos]);

  const filteredMovimentos = useMemo(() => {
    return eventMovimentos.filter((movimento) => {
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
      return matchesTab && matchesQuery && matchesPago;
    });
  }, [activeTab, eventMovimentos, normalizedQuery, pago]);

  const accountEntries = useMemo(() => {
    return movimentos.filter((movimento) => movimento.evento_slug === "contas" && movimento.tipo === "entrada");
  }, [movimentos]);

  const accountSaidas = useMemo(() => {
    return movimentos.filter(
      (movimento) =>
        movimento.evento_slug !== "contas" && movimento.tipo === "saida" && isContaPayment(movimento.tipo_pagamento)
    );
  }, [movimentos]);

  const accountCounts = useMemo(() => {
    return {
      entradas: accountEntries.length,
      saidas: accountSaidas.length,
      totalEntradas: accountEntries.reduce((sum, movimento) => sum + Number(movimento.montante ?? 0), 0),
      totalSaidas: accountSaidas.reduce((sum, movimento) => sum + Number(movimento.montante ?? 0), 0)
    };
  }, [accountEntries, accountSaidas]);

  const filteredAccountMovimentos = useMemo(() => {
    const source = activeTab === "entrada" ? accountEntries : accountSaidas;
    return source.filter((movimento) => {
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
      return matchesQuery && matchesPago;
    });
  }, [accountEntries, accountSaidas, activeTab, normalizedQuery, pago]);

  const resetFilters = () => {
    setQuery("");
    setPago("todos");
  };

  const switchSection = (mode: SectionMode) => {
    setSectionMode(mode);
    setActiveTab("entrada");
    setPago("todos");
    setQuery("");
  };

  const openCreateEvent = () => {
    setSaveMessage(null);
    setSelectedMovement(null);
    setEventForm(emptyEventForm);
    setModalMode("create-event");
  };

  const openEditEvent = () => {
    if (!selectedEvent) return;
    setSaveMessage(null);
    setSelectedMovement(null);
    setEventForm({
      nome: selectedEvent.nome,
      data_inicio: selectedEvent.data_inicio ?? "",
      data_fim: selectedEvent.data_fim ?? "",
      isento: isEventIsento(selectedEvent) ? "sim" : "nao",
      tipo: selectedEvent.tipo
    });
    setModalMode("edit-event");
  };

  const openMovementForm = (mode: "add-entry" | "add-exit") => {
    if (!selectedEvent) return;
    setSaveMessage(null);
    setSelectedMovement(null);
    setMovementForm(emptyMovementForm);
    setActiveTab(mode === "add-entry" ? "entrada" : "saida");
    setModalMode(mode);
  };

  const openEditMovement = (movimento: MovimentoDetalhe) => {
    setSaveMessage(null);
    setSelectedMovement(movimento);
    setMovementForm({
      item: movimento.item,
      montante: movimento.montante === null ? "" : String(movimento.montante),
      data_pagamento: movimento.data_pagamento ?? "",
      numero_fatura: movimento.numero_fatura ?? "",
      fatura_com_nif: booleanToForm(movimento.fatura_com_nif),
      tipo_pagamento: movimento.tipo_pagamento ?? "",
      pago: booleanToForm(movimento.pago)
    });
    setActiveTab(movimento.tipo === "entrada" ? "entrada" : "saida");
    setModalMode(movimento.tipo === "entrada" ? "edit-entry" : "edit-exit");
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalMode(null);
    setSelectedMovement(null);
  };

  const saveEvent = async () => {
    const name = eventForm.nome.trim();
    if (!name) throw new Error("Indica o nome do evento.");

    const payload = {
      nome: name,
      folha_excel: modalMode === "create-event" ? name : undefined,
      slug:
        modalMode === "create-event"
          ? nextAvailableSlug(name, eventos.map((event) => event.slug))
          : undefined,
      ordem_folha: modalMode === "create-event" ? Math.max(0, ...eventos.map((event) => event.ordem_folha)) + 1 : undefined,
      data_texto: eventForm.data_inicio ? `Data: ${eventForm.data_inicio}` : null,
      data_inicio: eventForm.data_inicio || null,
      data_fim: eventForm.data_fim || eventForm.data_inicio || null,
      isento: eventForm.isento === "sim",
      isento_texto: eventForm.isento === "sim" ? "Sim" : "Não",
      tipo: eventForm.tipo
    };

    if (modalMode === "create-event") {
      await supabaseWrite("eventos", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return;
    }

    if (!selectedEvent) throw new Error("Escolhe um evento para editar.");
    await supabaseWrite(`eventos?id=eq.${selectedEvent.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        nome: payload.nome,
        data_texto: payload.data_texto,
        data_inicio: payload.data_inicio,
        data_fim: payload.data_fim,
        isento: payload.isento,
        isento_texto: payload.isento_texto,
        tipo: payload.tipo
      })
    });
  };

  const saveMovement = async () => {
    const isEditing = modalMode === "edit-entry" || modalMode === "edit-exit";
    const isEntryMode = modalMode === "add-entry" || modalMode === "edit-entry";
    const movementToEdit = isEditing ? selectedMovement : null;
    if (!isEditing && !selectedEvent) throw new Error("Escolhe um evento antes de adicionar dados.");
    if (isEditing && !movementToEdit) throw new Error("Escolhe uma linha para editar.");

    const item = movementForm.item.trim();
    const amount = numericAmount(movementForm.montante);
    if (!item) throw new Error("Indica o item.");
    if (amount === null) throw new Error("Indica um montante válido.");

    const tipo = movementToEdit ? movementToEdit.tipo : isEntryMode ? "entrada" : "saida";
    const payload = {
      evento_id: isEditing ? undefined : selectedEvent?.id,
      tipo,
      item,
      data_pagamento: isEntryMode ? null : movementForm.data_pagamento || null,
      montante: amount,
      numero_fatura: isEntryMode ? null : movementForm.numero_fatura.trim() || null,
      fatura_com_nif: isEntryMode ? null : optionalBoolean(movementForm.fatura_com_nif),
      tipo_pagamento: isEntryMode ? null : movementForm.tipo_pagamento.trim() || null,
      pago: isEntryMode ? null : optionalBoolean(movementForm.pago),
      origem_tabela: movementToEdit ? movementToEdit.origem_tabela : manualOrigin(tipo),
      origem_linha: movementToEdit ? movementToEdit.origem_linha : 1,
      raw: {
        ...(movementToEdit ? movementToEdit.raw : {}),
        origem: "app",
        evento: movementToEdit ? movementToEdit.evento_nome : selectedEvent?.nome,
        item,
        montante: amount
      }
    };

    if (movementToEdit) {
      await supabaseWrite(`movimentos?id=eq.${movementToEdit.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      return;
    }

    await supabaseWrite("movimentos", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  };

  const deleteMovement = async (movimento: MovimentoDetalhe) => {
    if (sectionMode === "contas" && activeTab === "saida") return;
    const confirmed = window.confirm(`Apagar "${movimento.item}"?`);
    if (!confirmed) return;

    setIsSaving(true);
    setSaveMessage(null);
    try {
      await supabaseWrite(`movimentos?id=eq.${movimento.id}`, {
        method: "DELETE"
      });
      setSaveMessage("Registo apagado.");
      router.refresh();
    } catch (caught) {
      setSaveMessage(caught instanceof Error ? caught.message : "Não foi possível apagar.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderMovementActions = (movimento: MovimentoDetalhe) => (
    <div className="row-actions">
      <button type="button" onClick={() => openEditMovement(movimento)}>
        Editar
      </button>
      <button className="danger-button" disabled={isSaving} type="button" onClick={() => deleteMovement(movimento)}>
        Apagar
      </button>
    </div>
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!modalMode) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      if (modalMode === "create-event" || modalMode === "edit-event") {
        await saveEvent();
      } else {
        await saveMovement();
      }
      setModalMode(null);
      setSelectedMovement(null);
      setSaveMessage("Guardado com sucesso.");
      router.refresh();
    } catch (caught) {
      setSaveMessage(caught instanceof Error ? caught.message : "Não foi possível guardar.");
    } finally {
      setIsSaving(false);
    }
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

      <section className="management-menu" aria-label="Gestão e filtros">
        <div className="section-tabs" role="tablist" aria-label="Área principal">
          <button
            aria-selected={sectionMode === "eventos"}
            className={sectionMode === "eventos" ? "section-tab active" : "section-tab"}
            onClick={() => switchSection("eventos")}
            role="tab"
            type="button"
          >
            Eventos
          </button>
          <button
            aria-selected={sectionMode === "contas"}
            className={sectionMode === "contas" ? "section-tab active" : "section-tab"}
            onClick={() => switchSection("contas")}
            role="tab"
            type="button"
          >
            Contas
          </button>
        </div>
        <label className="menu-search">
          Pesquisa
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Item ou fatura"
          />
        </label>
        <label className="menu-paid">
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
        <div className="menu-actions">
          {sectionMode === "eventos" ? (
            <button type="button" onClick={openCreateEvent}>
              Novo evento
            </button>
          ) : (
            <div className="account-menu-summary">
              <span>Conta Q26</span>
              <strong>{formatMoney(accountCounts.totalEntradas - accountCounts.totalSaidas)}</strong>
            </div>
          )}
          <button className="secondary-menu-button" type="button" onClick={resetFilters}>
            Limpar
          </button>
        </div>
      </section>

      {saveMessage ? <section className="notice">{saveMessage}</section> : null}

      {error ? <section className="notice">Não consegui ligar ao Supabase. {error}</section> : null}

      <section className="metrics" aria-label="Resumo financeiro">
        {sectionMode === "eventos" ? (
          <>
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
              <span>Eventos isentos</span>
              <strong>{totals.isentos}</strong>
            </article>
          </>
        ) : (
          <>
            <article>
              <span>Entradas na conta</span>
              <strong>{formatMoney(accountCounts.totalEntradas)}</strong>
            </article>
            <article>
              <span>Saídas Conta Q26</span>
              <strong>{formatMoney(accountCounts.totalSaidas)}</strong>
            </article>
            <article>
              <span>Saldo em conta</span>
              <strong>{formatMoney(accountCounts.totalEntradas - accountCounts.totalSaidas)}</strong>
            </article>
            <article>
              <span>Movimentos</span>
              <strong>{accountCounts.entradas + accountCounts.saidas}</strong>
            </article>
          </>
        )}
      </section>

      {sectionMode === "eventos" ? (
      <section className="workspace">
        <aside className="event-list" aria-label="Eventos e categorias" role="tablist">
          {orderedEventos.map((event) => (
            <button
              aria-selected={selectedEvent?.slug === event.slug}
              className={selectedEvent?.slug === event.slug ? "event-card selected" : "event-card"}
              key={event.slug}
              role="tab"
              type="button"
              onClick={() => {
                setSelectedSlug(event.slug);
                setActiveTab("entrada");
                setPago("todos");
              }}
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

        <section className="table-panel" aria-label="Movimentos do evento">
          {selectedEvent ? (
            <>
              <div className="event-detail">
                <div>
                  <p className="eyebrow">{selectedEvent.tipo === "evento" ? "Evento" : "Categoria"}</p>
                  <h2>{selectedEvent.nome}</h2>
                  <span className="event-meta">
                    {selectedEvent.tipo === "evento" ? formatDate(selectedEvent.data_inicio) : selectedEvent.folha_excel}
                    {" · Isento: "}
                    {isEventIsento(selectedEvent) ? "Sim" : "Não"}
                  </span>
                </div>
                <div className="event-side">
                  <div className="event-totals">
                    <span>Saldo</span>
                    <strong className={Number(selectedEvent.saldo) >= 0 ? "positive" : "negative"}>
                      {formatMoney(selectedEvent.saldo)}
                    </strong>
                  </div>
                  <div className="event-actions">
                    <button type="button" onClick={() => openMovementForm("add-entry")}>
                      Adicionar entrada
                    </button>
                    <button type="button" onClick={() => openMovementForm("add-exit")}>
                      Adicionar saída
                    </button>
                    <button className="secondary-event-button" disabled={!selectedEvent} type="button" onClick={openEditEvent}>
                      Editar evento
                    </button>
                  </div>
                </div>
              </div>

              <div className="event-summary-grid" aria-label="Resumo do evento">
                <article>
                  <span>Entradas</span>
                  <strong>{formatMoney(eventFinancialSummary.entradas)}</strong>
                  <small>Todas as Entradas</small>
                </article>
                <article>
                  <span>Saídas</span>
                  <strong>{formatMoney(eventFinancialSummary.saidas)}</strong>
                  <small>Todas as Despesas</small>
                </article>
                <article>
                  <span>Saldo</span>
                  <strong className={eventFinancialSummary.entradas - eventFinancialSummary.saidas >= 0 ? "positive" : "negative"}>
                    {formatMoney(eventFinancialSummary.entradas - eventFinancialSummary.saidas)}
                  </strong>
                  <small>Lucro final</small>
                </article>
                <article>
                  <span>Faturado</span>
                  <strong>{formatMoney(eventFinancialSummary.faturado)}</strong>
                  <small>Fatura C/NIF: Sim</small>
                </article>
                <article>
                  <span>Não Faturado</span>
                  <strong>{formatMoney(eventFinancialSummary.naoFaturado)}</strong>
                  <small>Fatura C/NIF: Não</small>
                </article>
                <article>
                  <span>Pago C.Q26</span>
                  <strong>{formatMoney(eventFinancialSummary.pagoQ26)}</strong>
                  <small>Pagamento C. Q26</small>
                </article>
                <article>
                  <span>Transferencia</span>
                  <strong>{formatMoney(eventFinancialSummary.transferencia)}</strong>
                  <small>Pago por Transferencia</small>
                </article>
                <article>
                  <span>Pago Dinheiro</span>
                  <strong>{formatMoney(eventFinancialSummary.dinheiro)}</strong>
                  <small>Pago com Dinheiro</small>
                </article>
              </div>

              <div className="tabs" role="tablist" aria-label="Movimentos do evento">
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

              <div className="table-heading">
                <div>
                  <p className="eyebrow">{activeTab === "entrada" ? "Entradas" : "Saídas"}</p>
                  <h2>{filteredMovimentos.length} registos</h2>
                </div>
                <span>
                  {formatMoney(activeTab === "entrada" ? tabCounts.totalEntradas : tabCounts.totalSaidas)}
                </span>
              </div>

              <div className="table-wrap">
                <table className={activeTab === "entrada" ? "entries-table" : "outgoing-table"}>
                  <thead>
                    {activeTab === "entrada" ? (
                      <tr>
                        <th>Item</th>
                        <th>Montante</th>
                        <th>Ações</th>
                      </tr>
                    ) : (
                      <tr>
                        <th>Tipo</th>
                        <th>Item</th>
                        <th>Data</th>
                        <th>Montante</th>
                        <th>Pagamento</th>
                        <th>Fatura</th>
                        <th>Fatura C/NIF</th>
                        <th>Pago</th>
                        <th>Ações</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {filteredMovimentos.map((movimento) => (
                      activeTab === "entrada" ? (
                        <tr key={movimento.id}>
                          <td className="item-cell">{movimento.item}</td>
                          <td className="money">{formatMoney(movimento.montante)}</td>
                          <td>{renderMovementActions(movimento)}</td>
                        </tr>
                      ) : (
                        <tr key={movimento.id}>
                          <td>
                            <span className={`pill ${movimento.tipo}`}>{movementLabel(movimento.tipo)}</span>
                          </td>
                          <td className="item-cell">{movimento.item}</td>
                          <td>{formatDate(movimento.data_pagamento)}</td>
                          <td className="money">{formatMoney(movimento.montante)}</td>
                          <td>{movimento.tipo_pagamento ?? "—"}</td>
                          <td>{movimento.numero_fatura ?? "—"}</td>
                          <td>{movimento.fatura_com_nif === null ? "—" : movimento.fatura_com_nif ? "Sim" : "Não"}</td>
                          <td>{movimento.pago === null ? "—" : movimento.pago ? "Sim" : "Não"}</td>
                          <td>{renderMovementActions(movimento)}</td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p className="eyebrow">Eventos</p>
              <h2>Sem dados carregados</h2>
            </div>
          )}
        </section>
      </section>
      ) : (
        <section className="account-panel" aria-label="Contas Q26">
          <div className="event-detail">
            <div>
              <p className="eyebrow">Contas</p>
              <h2>Conta Q26</h2>
              <span className="event-meta">
                {accountEvent ? "Movimentos da folha Contas e despesas por Transferência ou C. Q26" : "Sem folha Contas carregada"}
              </span>
            </div>
            <div className="event-totals">
              <span>Saldo em conta</span>
              <strong className={accountCounts.totalEntradas - accountCounts.totalSaidas >= 0 ? "positive" : "negative"}>
                {formatMoney(accountCounts.totalEntradas - accountCounts.totalSaidas)}
              </strong>
            </div>
          </div>

          <div className="tabs" role="tablist" aria-label="Movimentos da conta">
            <button
              aria-selected={activeTab === "entrada"}
              className={activeTab === "entrada" ? "tab active" : "tab"}
              onClick={() => setActiveTab("entrada")}
              role="tab"
              type="button"
            >
              <span>Entradas</span>
              <strong>{accountCounts.entradas}</strong>
            </button>
            <button
              aria-selected={activeTab === "saida"}
              className={activeTab === "saida" ? "tab active" : "tab"}
              onClick={() => setActiveTab("saida")}
              role="tab"
              type="button"
            >
              <span>Saídas</span>
              <strong>{accountCounts.saidas}</strong>
            </button>
          </div>

          <div className="table-heading">
            <div>
              <p className="eyebrow">{activeTab === "entrada" ? "Entradas na conta" : "Saídas Conta Q26"}</p>
              <h2>{filteredAccountMovimentos.length} registos</h2>
            </div>
            <span>
              {formatMoney(activeTab === "entrada" ? accountCounts.totalEntradas : accountCounts.totalSaidas)}
            </span>
          </div>

          <div className="table-wrap">
            <table className={activeTab === "entrada" ? "entries-table" : "outgoing-table"}>
              <thead>
                {activeTab === "entrada" ? (
                  <tr>
                    <th>Item</th>
                    <th>Montante</th>
                    <th>Ações</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Evento</th>
                    <th>Item</th>
                    <th>Data</th>
                    <th>Montante</th>
                    <th>Pagamento</th>
                    <th>Fatura C/NIF</th>
                    <th>Pago</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {filteredAccountMovimentos.map((movimento) => (
                  activeTab === "entrada" ? (
                    <tr key={movimento.id}>
                      <td className="item-cell">{movimento.item}</td>
                      <td className="money">{formatMoney(movimento.montante)}</td>
                      <td>{renderMovementActions(movimento)}</td>
                    </tr>
                  ) : (
                    <tr key={movimento.id}>
                      <td>{movimento.evento_nome}</td>
                      <td className="item-cell">{movimento.item}</td>
                      <td>{formatDate(movimento.data_pagamento)}</td>
                      <td className="money">{formatMoney(movimento.montante)}</td>
                      <td>{movimento.tipo_pagamento ?? "—"}</td>
                      <td>{movimento.fatura_com_nif === null ? "—" : movimento.fatura_com_nif ? "Sim" : "Não"}</td>
                      <td>{movimento.pago === null ? "—" : movimento.pago ? "Sim" : "Não"}</td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {modalMode ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={handleSubmit}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Gestão</p>
                <h2>
                  {modalMode === "create-event"
                    ? "Novo evento"
                    : modalMode === "edit-event"
                      ? "Editar evento"
                      : modalMode === "add-entry"
                        ? "Adicionar entrada"
                        : modalMode === "add-exit"
                          ? "Adicionar saída"
                          : modalMode === "edit-entry"
                            ? "Editar entrada"
                            : "Editar saída"}
                </h2>
              </div>
              <button aria-label="Fechar" className="icon-button" onClick={closeModal} type="button">
                ×
              </button>
            </div>

            {modalMode === "create-event" || modalMode === "edit-event" ? (
              <div className="form-grid">
                <label className="full">
                  Nome
                  <input
                    required
                    value={eventForm.nome}
                    onChange={(event) => setEventForm((current) => ({ ...current, nome: event.target.value }))}
                  />
                </label>
                <label>
                  Data início
                  <input
                    type="date"
                    value={eventForm.data_inicio}
                    onChange={(event) => setEventForm((current) => ({ ...current, data_inicio: event.target.value }))}
                  />
                </label>
                <label>
                  Data fim
                  <input
                    type="date"
                    value={eventForm.data_fim}
                    onChange={(event) => setEventForm((current) => ({ ...current, data_fim: event.target.value }))}
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={eventForm.tipo}
                    onChange={(event) =>
                      setEventForm((current) => ({ ...current, tipo: event.target.value as EventForm["tipo"] }))
                    }
                  >
                    <option value="evento">Evento</option>
                    <option value="categoria">Categoria</option>
                  </select>
                </label>
                <label>
                  Isento
                  <select
                    value={eventForm.isento}
                    onChange={(event) =>
                      setEventForm((current) => ({ ...current, isento: event.target.value as EventForm["isento"] }))
                    }
                  >
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="form-grid">
                <label className="full">
                  Item
                  <input
                    required
                    value={movementForm.item}
                    onChange={(event) => setMovementForm((current) => ({ ...current, item: event.target.value }))}
                  />
                </label>
                <label>
                  Montante
                  <input
                    inputMode="decimal"
                    required
                    value={movementForm.montante}
                    onChange={(event) => setMovementForm((current) => ({ ...current, montante: event.target.value }))}
                    placeholder="0,00"
                  />
                </label>
                {modalMode === "add-exit" || modalMode === "edit-exit" ? (
                  <>
                    <label>
                      Data pagamento
                      <input
                        type="date"
                        value={movementForm.data_pagamento}
                        onChange={(event) =>
                          setMovementForm((current) => ({ ...current, data_pagamento: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Tipo pagamento
                      <select
                        value={movementForm.tipo_pagamento}
                        onChange={(event) =>
                          setMovementForm((current) => ({ ...current, tipo_pagamento: event.target.value }))
                        }
                      >
                        <option value="">—</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="C. Q26">C. Q26</option>
                        <option value="Transferencia">Transferencia</option>
                      </select>
                    </label>
                    <label>
                      Nº Fatura
                      <input
                        value={movementForm.numero_fatura}
                        onChange={(event) =>
                          setMovementForm((current) => ({ ...current, numero_fatura: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Fatura C/NIF
                      <select
                        value={movementForm.fatura_com_nif}
                        onChange={(event) =>
                          setMovementForm((current) => ({
                            ...current,
                            fatura_com_nif: event.target.value as MovementForm["fatura_com_nif"]
                          }))
                        }
                      >
                        <option value="">—</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </label>
                    <label>
                      Pago
                      <select
                        value={movementForm.pago}
                        onChange={(event) =>
                          setMovementForm((current) => ({ ...current, pago: event.target.value as MovementForm["pago"] }))
                        }
                      >
                        <option value="">—</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </label>
                  </>
                ) : null}
              </div>
            )}

            {saveMessage ? <p className="form-message">{saveMessage}</p> : null}

            <div className="modal-actions">
              <button className="secondary-button" onClick={closeModal} type="button">
                Cancelar
              </button>
              <button disabled={isSaving} type="submit">
                {isSaving ? "A guardar..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

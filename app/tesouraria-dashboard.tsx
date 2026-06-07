"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EventoResumo, MovimentoDetalhe } from "./supabase-data";

type DashboardProps = {
  eventos: EventoResumo[];
  movimentos: MovimentoDetalhe[];
  error: string | null;
};

type ModalMode = "create-event" | "edit-event" | "add-entry" | "add-exit" | null;

type EventForm = {
  nome: string;
  data_inicio: string;
  data_fim: string;
  isento_texto: string;
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
  isento_texto: "",
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

  return response.json();
}

export function Dashboard({ eventos, movimentos, error }: DashboardProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"entrada" | "saida">("entrada");
  const [pago, setPago] = useState<"todos" | "sim" | "nao">("todos");
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm);
  const [movementForm, setMovementForm] = useState<MovementForm>(emptyMovementForm);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const orderedEventos = useMemo(() => {
    return [...eventos].sort((a, b) => {
      const balanceDelta = Number(b.saldo ?? 0) - Number(a.saldo ?? 0);
      return balanceDelta || a.ordem_folha - b.ordem_folha;
    });
  }, [eventos]);

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

  const resetFilters = () => {
    setQuery("");
    setPago("todos");
  };

  const openCreateEvent = () => {
    setSaveMessage(null);
    setEventForm(emptyEventForm);
    setModalMode("create-event");
  };

  const openEditEvent = () => {
    if (!selectedEvent) return;
    setSaveMessage(null);
    setEventForm({
      nome: selectedEvent.nome,
      data_inicio: selectedEvent.data_inicio ?? "",
      data_fim: selectedEvent.data_fim ?? "",
      isento_texto: selectedEvent.isento_texto ?? "",
      tipo: selectedEvent.tipo
    });
    setModalMode("edit-event");
  };

  const openMovementForm = (mode: "add-entry" | "add-exit") => {
    if (!selectedEvent) return;
    setSaveMessage(null);
    setMovementForm(emptyMovementForm);
    setActiveTab(mode === "add-entry" ? "entrada" : "saida");
    setModalMode(mode);
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalMode(null);
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
      isento_texto: eventForm.isento_texto.trim() || null,
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
        isento_texto: payload.isento_texto,
        tipo: payload.tipo
      })
    });
  };

  const saveMovement = async () => {
    if (!selectedEvent) throw new Error("Escolhe um evento antes de adicionar dados.");
    const item = movementForm.item.trim();
    const amount = numericAmount(movementForm.montante);
    if (!item) throw new Error("Indica o item.");
    if (amount === null) throw new Error("Indica um montante válido.");

    const tipo = modalMode === "add-entry" ? "entrada" : "saida";
    const payload = {
      evento_id: selectedEvent.id,
      tipo,
      item,
      data_pagamento: modalMode === "add-entry" ? null : movementForm.data_pagamento || null,
      montante: amount,
      numero_fatura: modalMode === "add-entry" ? null : movementForm.numero_fatura.trim() || null,
      fatura_com_nif: modalMode === "add-entry" ? null : optionalBoolean(movementForm.fatura_com_nif),
      tipo_pagamento: modalMode === "add-entry" ? null : movementForm.tipo_pagamento.trim() || null,
      pago: modalMode === "add-entry" ? null : optionalBoolean(movementForm.pago),
      origem_tabela: manualOrigin(tipo),
      origem_linha: 1,
      raw: {
        origem: "app",
        evento: selectedEvent.nome,
        item,
        montante: amount
      }
    };

    await supabaseWrite("movimentos", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  };

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

      <section className="management-menu" aria-label="Gestão de eventos">
        <label>
          Evento
          <select
            value={selectedEvent?.slug ?? ""}
            onChange={(event) => {
              setSelectedSlug(event.target.value);
              setActiveTab("entrada");
              setPago("todos");
            }}
          >
            {orderedEventos.map((event) => (
              <option key={event.slug} value={event.slug}>
                {event.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="menu-actions">
          <button type="button" onClick={openCreateEvent}>
            Novo evento
          </button>
          <button disabled={!selectedEvent} type="button" onClick={openEditEvent}>
            Editar evento
          </button>
          <button disabled={!selectedEvent} type="button" onClick={() => openMovementForm("add-entry")}>
            Adicionar entrada
          </button>
          <button disabled={!selectedEvent} type="button" onClick={() => openMovementForm("add-exit")}>
            Adicionar saída
          </button>
        </div>
      </section>

      {saveMessage ? <section className="notice">{saveMessage}</section> : null}

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
        <label>
          Pesquisa
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Item ou fatura"
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
          <div className="event-list-heading">
            <p className="eyebrow">Eventos</p>
            <h2>Escolhe um evento</h2>
          </div>
          {orderedEventos.map((event) => (
            <button
              className={selectedEvent?.slug === event.slug ? "event-card selected" : "event-card"}
              key={event.slug}
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
                  </span>
                </div>
                <div className="event-totals">
                  <span>Saldo</span>
                  <strong className={Number(selectedEvent.saldo) >= 0 ? "positive" : "negative"}>
                    {formatMoney(selectedEvent.saldo)}
                  </strong>
                </div>
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
                      </tr>
                    ) : (
                      <tr>
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
                          <td className="item-cell">{movimento.item}</td>
                          <td className="money">{formatMoney(movimento.montante)}</td>
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
                          <td>{movimento.pago === null ? "—" : movimento.pago ? "Sim" : "Não"}</td>
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
                        : "Adicionar saída"}
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
                  <input
                    value={eventForm.isento_texto}
                    onChange={(event) => setEventForm((current) => ({ ...current, isento_texto: event.target.value }))}
                    placeholder="N.Isento"
                  />
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
                {modalMode === "add-exit" ? (
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
                      <input
                        value={movementForm.tipo_pagamento}
                        onChange={(event) =>
                          setMovementForm((current) => ({ ...current, tipo_pagamento: event.target.value }))
                        }
                        placeholder="Dinheiro"
                      />
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

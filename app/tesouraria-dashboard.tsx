"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppLogo } from "./app-settings";
import {
  canAccessAdmin,
  canDelete,
  canWrite,
  getRoleLabel,
  requiresJustification,
  type AuthSession
} from "./auth-types";
import type { EventoResumo, MovimentoDetalhe } from "./supabase-data";
import { TopbarActions } from "./topbar-actions";
import { TopbarBrand } from "./topbar-brand";

type DashboardProps = {
  eventos: EventoResumo[];
  movimentos: MovimentoDetalhe[];
  error: string | null;
  q25Balance: number;
  showQ25ProfitCard: boolean;
  physicalCashCount: number | null;
  session: AuthSession;
  appLogo: AppLogo | null;
};

type ModalMode = "create-event" | "edit-event" | "add-entry" | "add-exit" | "edit-entry" | "edit-exit" | null;
type SectionMode = "eventos" | "contas" | "peditorio" | "patrocinios";

type DescriptionPopup = {
  title: string;
  text: string;
};

type MovementHistoryEntry = {
  id: string;
  created_at: string;
  username: string;
  role: AuthSession["role"];
  action: string;
  resource: string;
  resource_id: string | null;
  summary: string | null;
  details: Record<string, unknown>;
};

type MovementHistoryState = {
  movimento: MovimentoDetalhe;
  logs: MovementHistoryEntry[];
  isLoading: boolean;
  error: string | null;
};

type EventForm = {
  nome: string;
  data_inicio: string;
  data_fim: string;
  isento: "sim" | "nao";
  contabilizar_totais: "sim" | "nao";
  cor: string;
  tipo: "evento" | "categoria";
};

type EntryKind = "faturacao" | "patrocinio" | "peditorio" | "deposito";

type MovementForm = {
  item: string;
  descricao: string;
  montante: string;
  valor_teorico: string;
  data_pagamento: string;
  numero_fatura: string;
  fatura_com_nif: "" | "sim" | "nao";
  faturar_mais_tarde: boolean;
  tipo_entrada: EntryKind;
  precisa_fatura: boolean;
  patrocinio: boolean;
  fatura_emitida: "sim" | "nao";
  tipo_pagamento: string;
  pago: "" | "sim" | "nao";
  contabilizar_totais: boolean;
};

type FinancialSummary = {
  entradas: number;
  saidas: number;
  faturado: number;
  naoFaturado: number;
  pagoQ26: number;
  transferencia: number;
  dinheiro: number;
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

const emptyEventForm: EventForm = {
  nome: "",
  data_inicio: "",
  data_fim: "",
  isento: "nao",
  contabilizar_totais: "sim",
  cor: "",
  tipo: "evento"
};

const EVENT_COLOR_OPTIONS = [
  { value: "", label: "Default", accent: "#1f66e5", border: "#c4d8ff", surface: "#ffffff" },
  { value: "azul", label: "Azul", accent: "#1f66e5", border: "#9ebcff", surface: "#eef5ff" },
  { value: "verde", label: "Verde", accent: "#25815c", border: "#9fd7bd", surface: "#ecf9f3" },
  { value: "amarelo", label: "Amarelo", accent: "#b7791f", border: "#efd089", surface: "#fff8e7" },
  { value: "vermelho", label: "Vermelho", accent: "#b23b55", border: "#efb2bf", surface: "#fff1f4" },
  { value: "roxo", label: "Roxo", accent: "#7552c7", border: "#c8b9f3", surface: "#f4f0ff" },
  { value: "ciano", label: "Ciano", accent: "#147d9f", border: "#9dd5e4", surface: "#eafaff" },
  { value: "cinza", label: "Cinza", accent: "#556987", border: "#c1cad7", surface: "#f2f5f9" }
] as const;

const ENTRY_KIND_OPTIONS: { value: EntryKind; label: string }[] = [
  { value: "faturacao", label: "Faturação" },
  { value: "patrocinio", label: "Patrocínio" },
  { value: "peditorio", label: "Peditório" },
  { value: "deposito", label: "Depósito" }
];

const SPECIAL_EVENT_SECTIONS: Array<{
  mode: Extract<SectionMode, "peditorio" | "patrocinios">;
  label: string;
  slugs: string[];
}> = [
  { mode: "peditorio", label: "Peditório", slugs: ["peditorio"] },
  { mode: "patrocinios", label: "Patrocínios", slugs: ["patrocinios-festa", "patrocinios"] }
];

const emptyMovementForm: MovementForm = {
  item: "",
  descricao: "",
  montante: "",
  valor_teorico: "",
  data_pagamento: "",
  numero_fatura: "",
  fatura_com_nif: "",
  faturar_mais_tarde: false,
  tipo_entrada: "faturacao",
  precisa_fatura: false,
  patrocinio: false,
  fatura_emitida: "nao",
  tipo_pagamento: "",
  pago: "sim",
  contabilizar_totais: true
};

function movementFormDefaults(tab?: "entrada" | "saida"): MovementForm {
  return {
    ...emptyMovementForm,
    data_pagamento: tab === "entrada" ? todayInputDate() : "",
    tipo_pagamento: tab === "entrada" ? "Dinheiro" : ""
  };
}

function todayInputDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function accountDepositFormDefaults(): MovementForm {
  return {
    ...emptyMovementForm,
    item: "Depósito",
    data_pagamento: todayInputDate(),
    tipo_entrada: "deposito",
    tipo_pagamento: "Conta Q26"
  };
}

function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(Number(value ?? 0));
}

function formatAmountInput(value: number | null | undefined) {
  if (value === null || typeof value === "undefined") return "";
  return Number(value)
    .toFixed(2)
    .replace(".", ",");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem data";
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

const MOVEMENT_HISTORY_FIELDS = [
  ["tipo", "Tipo"],
  ["item", "Item"],
  ["descricao", "Descrição"],
  ["data_pagamento", "Data"],
  ["montante", "Montante"],
  ["numero_fatura", "Nº Fatura"],
  ["fatura_com_nif", "Fatura C/NIF"],
  ["tipo_pagamento", "Pagamento"],
  ["pago", "Pago"],
  ["contabilizar_totais", "Totais gerais"],
  ["origem_tabela", "Origem"],
  ["origem_linha", "Linha"]
] as const;

function movementHistorySnapshot(log: MovementHistoryEntry, key: "before" | "after") {
  return asRecord(log.details?.[key]);
}

function movementHistoryFallbackSnapshot(log: MovementHistoryEntry) {
  return movementHistorySnapshot(log, "after") ?? asRecord(log.details?.payload);
}

function formatHistoryValue(field: string, value: unknown) {
  if (value === null || typeof value === "undefined" || value === "") return "-";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (field === "montante") return formatMoney(Number(value));
  if (field === "data_pagamento" && typeof value === "string") return formatDate(value);
  return String(value);
}

function historyChangedFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const snapshot = after ?? before;
  if (!snapshot) return [];

  return MOVEMENT_HISTORY_FIELDS.filter(([field]) => {
    if (!before || !after) return Object.prototype.hasOwnProperty.call(snapshot, field);
    return JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null);
  });
}

function movementHistoryJustification(log: MovementHistoryEntry) {
  const detailsJustification = log.details?.justificacao;
  if (typeof detailsJustification === "string" && detailsJustification.trim()) return detailsJustification.trim();

  const payload = asRecord(log.details?.payload);
  const raw = asRecord(payload?.raw);
  const lastChange = asRecord(raw?.ultima_alteracao);
  const rawJustification = lastChange?.justificacao;
  return typeof rawJustification === "string" && rawJustification.trim() ? rawJustification.trim() : null;
}

function isEventIsento(event: EventoResumo) {
  if (typeof event.isento === "boolean") return event.isento;
  const value = event.isento_texto?.trim().toLowerCase();
  return value === "sim";
}

function isEventCounted(event: EventoResumo) {
  if (typeof event.contabilizar_totais === "boolean") return event.contabilizar_totais;
  return event.slug !== "decoracao";
}

function isEventClosed(event: EventoResumo | null | undefined) {
  return event?.fechado === true;
}

function isMovementCounted(movimento: MovimentoDetalhe) {
  return movimento.contabilizar_totais !== false;
}

function getEventColorOption(value: string | null | undefined) {
  return EVENT_COLOR_OPTIONS.find((option) => option.value === value);
}

function eventColorStyle(option: (typeof EVENT_COLOR_OPTIONS)[number]) {
  return {
    "--swatch-color": option.accent,
    "--swatch-border": option.border,
    "--swatch-bg": option.surface
  } as CSSProperties;
}

function eventCardStyle(event: EventoResumo) {
  const option = getEventColorOption(event.cor);
  if (!event.cor || !option) return undefined;

  return {
    "--event-accent": option.accent,
    "--event-border": option.border,
    "--event-surface": option.surface
  } as CSSProperties;
}

function isPendingPayment(movimento: MovimentoDetalhe) {
  return movimento.tipo !== "entrada" && movimento.pago === false;
}

function isMarkedForLaterInvoice(movimento: MovimentoDetalhe) {
  const value = movimento.raw?.faturar_mais_tarde;
  return value === true || value === "sim" || value === "true";
}

function isRawFlagEnabled(value: unknown) {
  return value === true || value === "sim" || value === "true";
}

function normalizeEntryKind(value: unknown): EntryKind | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalized === "patrocinio") return "patrocinio";
  if (normalized === "peditorio") return "peditorio";
  if (normalized === "deposito") return "deposito";
  if (normalized === "faturacao" || normalized === "facturacao") return "faturacao";
  return null;
}

function movementEntryKind(movimento: MovimentoDetalhe): EntryKind {
  return (
    normalizeEntryKind(movimento.raw?.tipo_entrada) ??
    (isRawFlagEnabled(movimento.raw?.patrocinio) ? "patrocinio" : "faturacao")
  );
}

function isSponsorEntry(movimento: MovimentoDetalhe) {
  return movementEntryKind(movimento) === "patrocinio";
}

function isFinanceInvoiceEntry(movimento: MovimentoDetalhe) {
  return (
    movementEntryKind(movimento) === "faturacao" &&
    (isRawFlagEnabled(movimento.raw?.precisa_fatura) || isRawFlagEnabled(movimento.raw?.necessita_fatura))
  );
}

function needsEntryInvoice(movimento: MovimentoDetalhe) {
  return isSponsorEntry(movimento) || isFinanceInvoiceEntry(movimento);
}

function formNeedsInvoice(form: MovementForm) {
  return form.patrocinio || (form.tipo_entrada === "faturacao" && form.precisa_fatura);
}

function entryKindLabel(kind: EntryKind) {
  if (kind === "patrocinio") return "Patrocínio";
  if (kind === "peditorio") return "Peditório";
  if (kind === "deposito") return "Depósito";
  return "Faturação";
}

function isInvoiceIssued(movimento: MovimentoDetalhe) {
  return isRawFlagEnabled(movimento.raw?.fatura_emitida);
}

function rawNumericAmount(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return numericAmount(value) ?? 0;
  return 0;
}

function theoreticalEntryAmount(movimento: MovimentoDetalhe) {
  return rawNumericAmount(movimento.raw?.valor_teorico);
}

function yesNo(value: boolean) {
  return value ? "Sim" : "Não";
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

function specialSectionForSlug(slug: string | null | undefined): SectionMode | null {
  if (!slug) return null;
  const normalizedSlug = slugify(slug);
  const match = SPECIAL_EVENT_SECTIONS.find((section) => section.slugs.includes(normalizedSlug));
  return match?.mode ?? null;
}

function specialSectionForEvent(event: EventoResumo): SectionMode | null {
  return specialSectionForSlug(event.slug) ?? specialSectionForSlug(event.nome);
}

function isSpecialTreasuryEvent(event: EventoResumo) {
  return specialSectionForEvent(event) !== null;
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

function isBankEntryPayment(value: string | null | undefined) {
  const payment = normalizePayment(value);
  return payment === "multibanco" || payment === "transferencia";
}

function entryPaymentLabel(movimento: MovimentoDetalhe) {
  const payment = normalizePayment(movimento.tipo_pagamento);
  if (payment === "multibanco") return "Multibanco";
  if (payment === "transferencia") return "Transferencia";
  return "Dinheiro";
}

function accountEntryLabel(movimento: MovimentoDetalhe) {
  return movimento.evento_slug === "contas" ? "Conta Q26" : entryPaymentLabel(movimento);
}

function isAccountEntry(movimento: MovimentoDetalhe) {
  return movimento.tipo === "entrada" && (movimento.evento_slug === "contas" || isBankEntryPayment(movimento.tipo_pagamento));
}

function summarizeMovimentos(movimentos: MovimentoDetalhe[]): FinancialSummary {
  return movimentos.reduce(
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
}

function summarizeEventGroup(events: EventoResumo[], movimentos: MovimentoDetalhe[]) {
  const countedSlugs = new Set(events.filter(isEventCounted).map((event) => event.slug));
  const summary = { entradas: 0, saidas: 0, aPagamento: 0, saldo: 0 };

  movimentos.forEach((movimento) => {
    if (!countedSlugs.has(movimento.evento_slug) || !isMovementCounted(movimento)) return;

    const amount = Number(movimento.montante ?? 0);
    if (movimento.tipo === "entrada") summary.entradas += amount;
    if (movimento.tipo === "saida") summary.saidas += amount;
    if (movimento.tipo === "a_pagamento" || isPendingPayment(movimento)) summary.aPagamento += amount;
  });

  summary.saldo = summary.entradas - summary.saidas;
  return summary;
}

function numericAmount(value: string) {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return null;
  if (normalized.includes(",") && normalized.includes(".")) {
    const parsed = Number(normalized.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (normalized.includes(",")) {
    const parsed = Number(normalized.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function manualOrigin(prefix: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `app_${prefix}_${id}`;
}

async function appWrite(resource: string, options: RequestInit) {
  const response = await fetch(`/api/${resource}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export function Dashboard({
  eventos,
  movimentos,
  error,
  q25Balance,
  showQ25ProfitCard,
  physicalCashCount,
  session,
  appLogo
}: DashboardProps) {
  const router = useRouter();
  const mayWrite = canWrite(session);
  const mayDelete = canDelete(session);
  const mayAccessAdmin = canAccessAdmin(session);
  const mustJustify = requiresJustification(session);
  const [targetEventParam, setTargetEventParam] = useState<string | null>(null);
  const [targetMovementParam, setTargetMovementParam] = useState<string | null>(null);
  const [sectionMode, setSectionMode] = useState<SectionMode>("eventos");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"entrada" | "saida">("entrada");
  const [pago, setPago] = useState<"todos" | "sim" | "nao">("todos");
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm);
  const [movementForm, setMovementForm] = useState<MovementForm>(emptyMovementForm);
  const [quickAddTab, setQuickAddTab] = useState<"entrada" | "saida" | null>(null);
  const [quickMovementForm, setQuickMovementForm] = useState<MovementForm>(emptyMovementForm);
  const [accountQuickAddOpen, setAccountQuickAddOpen] = useState(false);
  const [accountMovementForm, setAccountMovementForm] = useState<MovementForm>(accountDepositFormDefaults);
  const [justification, setJustification] = useState("");
  const [selectedMovement, setSelectedMovement] = useState<MovimentoDetalhe | null>(null);
  const [descriptionPopup, setDescriptionPopup] = useState<DescriptionPopup | null>(null);
  const [historyPopup, setHistoryPopup] = useState<MovementHistoryState | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [physicalCashAmount, setPhysicalCashAmount] = useState<number | null>(physicalCashCount);
  const [physicalCashInput, setPhysicalCashInput] = useState(formatAmountInput(physicalCashCount));
  const [physicalCashMessage, setPhysicalCashMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPhysicalCash, setIsSavingPhysicalCash] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTargetEventParam(params.get("event"));
    setTargetMovementParam(params.get("movement"));
  }, []);

  const accountEvent = useMemo(() => {
    return eventos.find((event) => event.slug === "contas") ?? null;
  }, [eventos]);
  const accountEventClosed = isEventClosed(accountEvent);

  const specialEventByMode = useMemo(() => {
    const map = new Map<SectionMode, EventoResumo>();
    eventos.forEach((event) => {
      const mode = specialSectionForEvent(event);
      if (mode && !map.has(mode)) map.set(mode, event);
    });
    return map;
  }, [eventos]);

  const peditorioEvent = specialEventByMode.get("peditorio") ?? null;
  const sponsorEvent = specialEventByMode.get("patrocinios") ?? null;

  const pendingPayments = useMemo(() => {
    return movimentos.filter(isPendingPayment);
  }, [movimentos]);

  const eventOnlyList = useMemo(() => {
    return eventos.filter((event) => event.slug !== "contas" && !isSpecialTreasuryEvent(event));
  }, [eventos]);

  const treasuryEventList = useMemo(() => {
    return eventos.filter((event) => event.slug !== "contas");
  }, [eventos]);

  const eventClosedBySlug = useMemo(() => {
    return new Map(eventos.map((event) => [event.slug, isEventClosed(event)]));
  }, [eventos]);

  const totals = useMemo(() => {
    const eventStatus = new Map(
      treasuryEventList.map((event) => [event.slug, { counted: isEventCounted(event), isento: isEventIsento(event) }])
    );
    const summary = { entradas: 0, saidas: 0, aPagamento: 0, movimentos: 0, isentos: 0 };

    eventStatus.forEach((status) => {
      if (status.counted && status.isento) summary.isentos += 1;
    });

    movimentos.forEach((movimento) => {
      const status = eventStatus.get(movimento.evento_slug);
      if (!status?.counted || !isMovementCounted(movimento)) return;

      const amount = Number(movimento.montante ?? 0);
      if (movimento.tipo === "entrada") summary.entradas += amount;
      if (movimento.tipo === "saida") summary.saidas += amount;
      if (movimento.tipo === "a_pagamento" || isPendingPayment(movimento)) summary.aPagamento += amount;
      summary.movimentos += 1;
    });

    return summary;
  }, [treasuryEventList, movimentos]);

  const regularEventTotals = useMemo(() => summarizeEventGroup(eventOnlyList, movimentos), [eventOnlyList, movimentos]);
  const sponsorTotals = useMemo(
    () => summarizeEventGroup(sponsorEvent ? [sponsorEvent] : [], movimentos),
    [movimentos, sponsorEvent]
  );
  const peditorioTotals = useMemo(
    () => summarizeEventGroup(peditorioEvent ? [peditorioEvent] : [], movimentos),
    [movimentos, peditorioEvent]
  );

  const orderedEventos = useMemo(() => {
    return [...eventOnlyList].sort((a, b) => {
      const aTime = a.data_inicio ? new Date(`${a.data_inicio}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.data_inicio ? new Date(`${b.data_inicio}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime || a.ordem_folha - b.ordem_folha;
    });
  }, [eventOnlyList]);

  const targetMovement = useMemo(() => {
    if (!targetMovementParam) return null;
    return movimentos.find((movimento) => movimento.id === targetMovementParam) ?? null;
  }, [movimentos, targetMovementParam]);

  const selectedEvent = useMemo(() => {
    if (sectionMode === "contas") return null;
    if (sectionMode === "peditorio") return peditorioEvent;
    if (sectionMode === "patrocinios") return sponsorEvent;
    return orderedEventos.find((event) => event.slug === selectedSlug) ?? orderedEventos[0] ?? null;
  }, [orderedEventos, peditorioEvent, sectionMode, selectedSlug, sponsorEvent]);

  const selectedEventClosed = isEventClosed(selectedEvent);

  const isMovementLocked = (movimento: MovimentoDetalhe) => eventClosedBySlug.get(movimento.evento_slug) === true;

  const eventMovimentos = useMemo(() => {
    if (!selectedEvent) return [];
    return movimentos.filter((movimento) => movimento.evento_slug === selectedEvent.slug);
  }, [movimentos, selectedEvent]);

  useEffect(() => {
    if (targetMovement) {
      const specialMode = specialSectionForSlug(targetMovement.evento_slug);
      setSectionMode(targetMovement.evento_slug === "contas" ? "contas" : specialMode ?? "eventos");
      if (targetMovement.evento_slug !== "contas" && !specialMode) setSelectedSlug(targetMovement.evento_slug);
      setActiveTab(targetMovement.tipo === "entrada" ? "entrada" : "saida");
      setPago("todos");
      setQuery("");
      return;
    }

    if (targetEventParam) {
      const targetEvent = eventos.find((event) => event.id === targetEventParam || event.slug === targetEventParam);
      if (targetEvent) {
        const specialMode = specialSectionForEvent(targetEvent);
        setSectionMode(specialMode ?? "eventos");
        if (!specialMode) setSelectedSlug(targetEvent.slug);
        setActiveTab("entrada");
        setPago("todos");
        setQuery("");
      }
    }
  }, [eventos, targetEventParam, targetMovement]);

  const normalizedQuery = query.trim().toLowerCase();
  const tabCounts = useMemo(() => {
    return eventMovimentos.reduce(
      (acc, movimento) => {
        if (movimento.tipo === "entrada") {
          const amount = Number(movimento.montante ?? 0);
          const payment = normalizePayment(movimento.tipo_pagamento);
          acc.entradas += 1;
          acc.totalEntradas += amount;
          acc.totalValorTeorico += theoreticalEntryAmount(movimento);
          if (payment === "multibanco") {
            acc.totalEntradasMultibanco += amount;
          } else if (payment === "transferencia") {
            acc.totalEntradasTransferencia += amount;
          } else if (payment === "dinheiro" || !payment) {
            acc.totalEntradasDinheiro += amount;
          }
        } else {
          acc.saidas += 1;
          acc.totalSaidas += Number(movimento.montante ?? 0);
        }
        return acc;
      },
      {
        entradas: 0,
        saidas: 0,
        totalEntradas: 0,
        totalEntradasDinheiro: 0,
        totalEntradasMultibanco: 0,
        totalEntradasTransferencia: 0,
        totalValorTeorico: 0,
        totalSaidas: 0
      }
    );
  }, [eventMovimentos]);

  const eventFinancialSummary = useMemo(() => summarizeMovimentos(eventMovimentos), [eventMovimentos]);
  const eventMovementRatio = useMemo(() => {
    const entradas = Math.max(0, eventFinancialSummary.entradas);
    const saidas = Math.max(0, eventFinancialSummary.saidas);
    const total = entradas + saidas;
    const entradasPercent = total > 0 ? Math.round((entradas / total) * 100) : 0;
    const saidasPercent = total > 0 ? 100 - entradasPercent : 0;

    return { entradasPercent, saidasPercent };
  }, [eventFinancialSummary]);

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
    return movimentos.filter(isAccountEntry);
  }, [movimentos]);

  const accountSaidas = useMemo(() => {
    return movimentos.filter(
      (movimento) =>
        movimento.evento_slug !== "contas" &&
        movimento.tipo === "saida" &&
        isMovementCounted(movimento) &&
        isContaPayment(movimento.tipo_pagamento)
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

  const eventProfit = totals.entradas - totals.saidas;
  const accountBalance = accountCounts.totalEntradas - accountCounts.totalSaidas;
  const profitWithQ25Balance = eventProfit + q25Balance;
  const cashValue = profitWithQ25Balance - accountBalance;
  const physicalCashDifference = physicalCashAmount === null ? null : physicalCashAmount - cashValue;
  const specialSectionTotals =
    sectionMode === "patrocinios" ? sponsorTotals : sectionMode === "peditorio" ? peditorioTotals : null;

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

  const isAccountSection = sectionMode === "contas";
  const selectedSpecialSection = SPECIAL_EVENT_SECTIONS.find((section) => section.mode === sectionMode);
  const selectedSectionLabel = selectedSpecialSection?.label ?? "Eventos";

  const resetFilters = () => {
    setQuery("");
    setPago("todos");
  };

  const switchSection = (mode: SectionMode) => {
    setSectionMode(mode);
    setActiveTab("entrada");
    setPago("todos");
    setQuery("");
    setQuickAddTab(null);
    setAccountQuickAddOpen(false);
  };

  const savePhysicalCashCount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mayWrite) return;

    const amount = numericAmount(physicalCashInput);
    if (amount === null || amount < 0) {
      setPhysicalCashMessage("Indica o dinheiro físico contado.");
      return;
    }

    setIsSavingPhysicalCash(true);
    setPhysicalCashMessage(null);
    try {
      const body = (await appWrite("dinheiro-fisico", {
        method: "POST",
        body: JSON.stringify({ amount })
      })) as { amount?: number; message?: string } | null;
      const savedAmount = typeof body?.amount === "number" && Number.isFinite(body.amount) ? body.amount : amount;
      setPhysicalCashAmount(savedAmount);
      setPhysicalCashInput(formatAmountInput(savedAmount));
      setPhysicalCashMessage(body?.message ?? "Dinheiro físico contado atualizado.");
    } catch (caught) {
      setPhysicalCashMessage(caught instanceof Error ? caught.message : "Não foi possível guardar o dinheiro contado.");
    } finally {
      setIsSavingPhysicalCash(false);
    }
  };

  const openCreateEvent = () => {
    if (!mayWrite) return;
    setSaveMessage(null);
    setSelectedMovement(null);
    setEventForm(emptyEventForm);
    setJustification("");
    setModalMode("create-event");
  };

  const openEditEvent = () => {
    if (!selectedEvent || !mayWrite) return;
    if (selectedEventClosed) {
      setSaveMessage("Este evento está fechado. Desbloqueia no Admin para voltar a editar.");
      return;
    }
    setSaveMessage(null);
    setSelectedMovement(null);
    setEventForm({
      nome: selectedEvent.nome,
      data_inicio: selectedEvent.data_inicio ?? "",
      data_fim: selectedEvent.data_fim ?? "",
      isento: isEventIsento(selectedEvent) ? "sim" : "nao",
      contabilizar_totais: isEventCounted(selectedEvent) ? "sim" : "nao",
      cor: selectedEvent.cor ?? "",
      tipo: selectedEvent.tipo
    });
    setJustification("");
    setModalMode("edit-event");
  };

  const openQuickAdd = (tab: "entrada" | "saida") => {
    if (!selectedEvent || !mayWrite) return;
    if (selectedEventClosed) {
      setSaveMessage("Este evento está fechado. Desbloqueia no Admin para adicionar novos dados.");
      return;
    }
    setSaveMessage(null);
    setAccountQuickAddOpen(false);
    setQuickMovementForm(movementFormDefaults(tab));
    setQuickAddTab(tab);
    setActiveTab(tab);
  };

  const openAccountDepositAdd = () => {
    if (!mayWrite) return;
    if (!accountEvent) {
      setSaveMessage("Não encontrei a categoria Conta Q26 para registar o depósito.");
      return;
    }
    if (accountEventClosed) {
      setSaveMessage("A Conta Q26 está fechada. Desbloqueia no Admin para adicionar depósitos.");
      return;
    }
    setSaveMessage(null);
    setQuickAddTab(null);
    setAccountMovementForm(accountDepositFormDefaults());
    setAccountQuickAddOpen(true);
    setActiveTab("entrada");
  };

  const closeQuickAdd = () => {
    if (isSaving) return;
    setQuickAddTab(null);
    setQuickMovementForm(emptyMovementForm);
  };

  const closeAccountQuickAdd = () => {
    if (isSaving) return;
    setAccountQuickAddOpen(false);
    setAccountMovementForm(accountDepositFormDefaults());
  };

  const openEditMovement = (movimento: MovimentoDetalhe) => {
    if (!mayWrite) return;
    if (isMovementLocked(movimento)) {
      setSaveMessage("Este evento está fechado. Desbloqueia no Admin para alterar esta linha.");
      return;
    }
    setSaveMessage(null);
    setSelectedMovement(movimento);
    const entryKind = movementEntryKind(movimento);
    const invoiceNeeded = needsEntryInvoice(movimento);
    setMovementForm({
      item: movimento.item,
      descricao: movimento.descricao ?? "",
      montante: movimento.montante === null ? "" : String(movimento.montante),
      valor_teorico: movimento.raw?.valor_teorico == null ? "" : formatAmountInput(theoreticalEntryAmount(movimento)),
      data_pagamento: movimento.data_pagamento ?? "",
      numero_fatura: movimento.numero_fatura ?? "",
      fatura_com_nif: booleanToForm(movimento.fatura_com_nif),
      faturar_mais_tarde: isMarkedForLaterInvoice(movimento),
      tipo_entrada: entryKind,
      precisa_fatura: entryKind === "faturacao" && invoiceNeeded,
      patrocinio: entryKind === "patrocinio",
      fatura_emitida: invoiceNeeded && isInvoiceIssued(movimento) ? "sim" : "nao",
      tipo_pagamento:
        movimento.tipo === "entrada" && movimento.evento_slug !== "contas" ? entryPaymentLabel(movimento) : movimento.tipo_pagamento ?? "",
      pago: booleanToForm(movimento.pago),
      contabilizar_totais: isMovementCounted(movimento)
    });
    setJustification("");
    setActiveTab(movimento.tipo === "entrada" ? "entrada" : "saida");
    setModalMode(movimento.tipo === "entrada" ? "edit-entry" : "edit-exit");
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalMode(null);
    setSelectedMovement(null);
    setJustification("");
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
      contabilizar_totais: eventForm.contabilizar_totais === "sim",
      cor: eventForm.cor || null,
      tipo: eventForm.tipo
    };

    if (modalMode === "create-event") {
      await appWrite("eventos", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return;
    }

    if (!selectedEvent) throw new Error("Escolhe um evento para editar.");
    if (selectedEventClosed) throw new Error("Este evento está fechado. Desbloqueia no Admin para voltar a editar.");
    if (mustJustify && !justification.trim()) throw new Error("Indica a justificação da alteração.");
    await appWrite(`eventos/${selectedEvent.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        nome: payload.nome,
        data_texto: payload.data_texto,
        data_inicio: payload.data_inicio,
        data_fim: payload.data_fim,
        isento: payload.isento,
        isento_texto: payload.isento_texto,
        contabilizar_totais: payload.contabilizar_totais,
        cor: payload.cor,
        tipo: payload.tipo,
        justification
      })
    });
  };

  const deleteEvent = async () => {
    if (!mayDelete || !selectedEvent) return;
    if (selectedEventClosed) {
      setSaveMessage("Este evento está fechado. Desbloqueia no Admin antes de apagar.");
      return;
    }
    const confirmed = window.confirm(
      `Apagar o evento "${selectedEvent.nome}"? Esta ação também apaga todas as entradas e saídas deste evento.`
    );
    if (!confirmed) return;

    setIsSaving(true);
    setSaveMessage(null);
    try {
      await appWrite(`eventos/${selectedEvent.id}`, {
        method: "DELETE"
      });
      setSelectedSlug("");
      setSaveMessage("Evento apagado.");
      router.refresh();
    } catch (caught) {
      setSaveMessage(caught instanceof Error ? caught.message : "Não foi possível apagar o evento.");
    } finally {
      setIsSaving(false);
    }
  };

  const closeSelectedEvent = async () => {
    if (!mayAccessAdmin || !selectedEvent || selectedEventClosed) return;
    const confirmed = window.confirm(
      `Fechar o evento "${selectedEvent.nome}"? Depois de fechado, não poderá receber alterações até ser desbloqueado no Admin.`
    );
    if (!confirmed) return;

    setIsSaving(true);
    setSaveMessage(null);
    try {
      await appWrite(`eventos/${selectedEvent.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fechado: true })
      });
      setSaveMessage("Evento fechado.");
      router.refresh();
    } catch (caught) {
      setSaveMessage(caught instanceof Error ? caught.message : "Não foi possível fechar o evento.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveMovement = async () => {
    const isEditing = modalMode === "edit-entry" || modalMode === "edit-exit";
    const isEntryMode = modalMode === "add-entry" || modalMode === "edit-entry";
    const movementToEdit = isEditing ? selectedMovement : null;
    if (!isEditing && !selectedEvent) throw new Error("Escolhe um evento antes de adicionar dados.");
    if (!isEditing && selectedEventClosed) throw new Error("Este evento está fechado. Desbloqueia no Admin para adicionar dados.");
    if (isEditing && !movementToEdit) throw new Error("Escolhe uma linha para editar.");
    if (movementToEdit && isMovementLocked(movementToEdit)) {
      throw new Error("Este evento está fechado. Desbloqueia no Admin para alterar esta linha.");
    }

    const item = movementForm.item.trim();
    const amount = numericAmount(movementForm.montante);
    const theoreticalAmount = isEntryMode ? numericAmount(movementForm.valor_teorico) : null;
    if (!item) throw new Error("Indica o item.");
    if (amount === null) throw new Error("Indica um montante válido.");
    if (isEntryMode && movementForm.valor_teorico.trim() && theoreticalAmount === null) {
      throw new Error("Indica um valor teórico válido.");
    }
    if (mustJustify && isEditing && !justification.trim()) {
      throw new Error("Indica a justificação da alteração.");
    }

    const tipo = movementToEdit ? movementToEdit.tipo : isEntryMode ? "entrada" : "saida";
    const isAccountSheetEntry = isEntryMode && movementToEdit?.evento_slug === "contas";
    const entryPayment = movementForm.tipo_pagamento.trim() || (isAccountSheetEntry ? "" : "Dinheiro");
    const entryKind = isEntryMode ? movementForm.tipo_entrada : "faturacao";
    const entrySponsorship = isEntryMode ? entryKind === "patrocinio" : false;
    const entryNeedsInvoice = isEntryMode ? entrySponsorship || (entryKind === "faturacao" && movementForm.precisa_fatura) : false;
    const entryInvoiceIssued = entryNeedsInvoice ? movementForm.fatura_emitida === "sim" : false;
    const description = movementForm.descricao.trim() || null;
    const payload = {
      evento_id: isEditing ? undefined : selectedEvent?.id,
      tipo,
      item,
      descricao: description,
      data_pagamento: movementForm.data_pagamento || null,
      montante: amount,
      numero_fatura: isEntryMode ? null : movementForm.numero_fatura.trim() || null,
      fatura_com_nif: isEntryMode ? null : optionalBoolean(movementForm.fatura_com_nif),
      tipo_pagamento: isEntryMode ? entryPayment || null : movementForm.tipo_pagamento.trim() || null,
      pago: isEntryMode ? null : optionalBoolean(movementForm.pago),
      contabilizar_totais: isEntryMode ? true : movementForm.contabilizar_totais,
      origem_tabela: movementToEdit ? movementToEdit.origem_tabela : manualOrigin(tipo),
      origem_linha: movementToEdit ? movementToEdit.origem_linha : 1,
      raw: {
        ...(movementToEdit ? movementToEdit.raw : {}),
        origem: "app",
        evento: movementToEdit ? movementToEdit.evento_nome : selectedEvent?.nome,
        item,
        descricao: description,
        data_pagamento: movementForm.data_pagamento || null,
        montante: amount,
        tipo_pagamento: isEntryMode ? entryPayment || null : movementForm.tipo_pagamento.trim() || null,
        contabilizar_totais: isEntryMode ? true : movementForm.contabilizar_totais,
        ...(isEntryMode
          ? {
              patrocinio: entrySponsorship,
              precisa_fatura: entryKind === "faturacao" ? movementForm.precisa_fatura : false,
              tipo_entrada: entryKindLabel(entryKind),
              fatura_emitida: entryInvoiceIssued,
              valor_teorico: theoreticalAmount ?? null
            }
          : { faturar_mais_tarde: movementForm.faturar_mais_tarde })
      }
    };

    if (movementToEdit) {
      await appWrite(`movimentos/${movementToEdit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...payload,
          justification
        })
      });
      return;
    }

    await appWrite("movimentos", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  };

  const saveQuickMovement = async () => {
    if (!selectedEvent || !quickAddTab) return;
    if (selectedEventClosed) {
      setSaveMessage("Este evento está fechado. Desbloqueia no Admin para adicionar dados.");
      return;
    }

    const item = quickMovementForm.item.trim();
    const amount = numericAmount(quickMovementForm.montante);
    const isEntryMode = quickAddTab === "entrada";
    const theoreticalAmount = isEntryMode ? numericAmount(quickMovementForm.valor_teorico) : null;
    if (!item) {
      setSaveMessage("Indica o item.");
      return;
    }
    if (amount === null) {
      setSaveMessage("Indica um montante válido.");
      return;
    }
    if (isEntryMode && quickMovementForm.valor_teorico.trim() && theoreticalAmount === null) {
      setSaveMessage("Indica um valor teórico válido.");
      return;
    }

    const tipo = isEntryMode ? "entrada" : "saida";
    const entryPayment = quickMovementForm.tipo_pagamento.trim() || "Dinheiro";
    const entryKind = isEntryMode ? quickMovementForm.tipo_entrada : "faturacao";
    const entrySponsorship = isEntryMode ? entryKind === "patrocinio" : false;
    const entryNeedsInvoice = isEntryMode ? entrySponsorship || (entryKind === "faturacao" && quickMovementForm.precisa_fatura) : false;
    const entryInvoiceIssued = entryNeedsInvoice ? quickMovementForm.fatura_emitida === "sim" : false;
    const description = quickMovementForm.descricao.trim() || null;
    const payload = {
      evento_id: selectedEvent.id,
      tipo,
      item,
      descricao: description,
      data_pagamento: quickMovementForm.data_pagamento || null,
      montante: amount,
      numero_fatura: isEntryMode ? null : quickMovementForm.numero_fatura.trim() || null,
      fatura_com_nif: isEntryMode ? null : optionalBoolean(quickMovementForm.fatura_com_nif),
      tipo_pagamento: isEntryMode ? entryPayment : quickMovementForm.tipo_pagamento.trim() || null,
      pago: isEntryMode ? null : optionalBoolean(quickMovementForm.pago),
      contabilizar_totais: isEntryMode ? true : quickMovementForm.contabilizar_totais,
      origem_tabela: manualOrigin(tipo),
      origem_linha: 1,
      raw: {
        origem: "app",
        modo: "linha_rapida",
        evento: selectedEvent.nome,
        item,
        descricao: description,
        data_pagamento: quickMovementForm.data_pagamento || null,
        montante: amount,
        tipo_pagamento: isEntryMode ? entryPayment : quickMovementForm.tipo_pagamento.trim() || null,
        contabilizar_totais: isEntryMode ? true : quickMovementForm.contabilizar_totais,
        ...(isEntryMode
          ? {
              patrocinio: entrySponsorship,
              precisa_fatura: entryKind === "faturacao" ? quickMovementForm.precisa_fatura : false,
              tipo_entrada: entryKindLabel(entryKind),
              fatura_emitida: entryInvoiceIssued,
              valor_teorico: theoreticalAmount ?? null
            }
          : { faturar_mais_tarde: quickMovementForm.faturar_mais_tarde })
      }
    };

    setIsSaving(true);
    setSaveMessage(null);
    try {
      await appWrite("movimentos", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setQuickAddTab(null);
      setQuickMovementForm(emptyMovementForm);
      setSaveMessage("Registo rápido guardado.");
      router.refresh();
    } catch (caught) {
      setSaveMessage(caught instanceof Error ? caught.message : "Não foi possível guardar.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveAccountDeposit = async () => {
    if (!mayWrite || !accountEvent) return;
    if (accountEventClosed) {
      setSaveMessage("A Conta Q26 está fechada. Desbloqueia no Admin para adicionar depósitos.");
      return;
    }

    const item = accountMovementForm.item.trim();
    const amount = numericAmount(accountMovementForm.montante);
    const description = accountMovementForm.descricao.trim() || null;
    if (!item) {
      setSaveMessage("Indica o item do depósito.");
      return;
    }
    if (amount === null) {
      setSaveMessage("Indica um montante válido.");
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    try {
      await appWrite("movimentos", {
        method: "POST",
        body: JSON.stringify({
          evento_id: accountEvent.id,
          tipo: "entrada",
          item,
          descricao: description,
          data_pagamento: accountMovementForm.data_pagamento || null,
          montante: amount,
          numero_fatura: null,
          fatura_com_nif: null,
          tipo_pagamento: "Conta Q26",
          pago: null,
          contabilizar_totais: true,
          origem_tabela: manualOrigin("conta_entrada"),
          origem_linha: 1,
          raw: {
            origem: "app",
            modo: "entrada_manual_conta",
            evento: accountEvent.nome,
            item,
            descricao: description,
            data_pagamento: accountMovementForm.data_pagamento || null,
            montante: amount,
            tipo_pagamento: "Conta Q26",
            tipo_entrada: "Depósito",
            fatura_emitida: false,
            contabilizar_totais: true
          }
        })
      });
      setAccountQuickAddOpen(false);
      setAccountMovementForm(accountDepositFormDefaults());
      setSaveMessage("Depósito registado na Conta Q26.");
      router.refresh();
    } catch (caught) {
      setSaveMessage(caught instanceof Error ? caught.message : "Não foi possível registar o depósito.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteMovement = async (movimento: MovimentoDetalhe) => {
    if (!mayDelete) return;
    if (sectionMode === "contas" && activeTab === "saida") return;
    if (isMovementLocked(movimento)) {
      setSaveMessage("Este evento está fechado. Desbloqueia no Admin para apagar esta linha.");
      return;
    }
    const confirmed = window.confirm(`Apagar "${movimento.item}"?`);
    if (!confirmed) return;

    setIsSaving(true);
    setSaveMessage(null);
    try {
      await appWrite(`movimentos/${movimento.id}`, {
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

  const openMovementHistory = async (movimento: MovimentoDetalhe) => {
    setHistoryPopup({ movimento, logs: [], isLoading: true, error: null });
    try {
      const response = await fetch(`/api/movimentos/${movimento.id}/historico`, {
        cache: "no-store"
      });
      const body = (await response.json().catch(() => null)) as { logs?: MovementHistoryEntry[]; message?: string } | null;
      if (!response.ok) {
        throw new Error(body?.message ?? `${response.status} ${response.statusText}`);
      }
      setHistoryPopup({
        movimento,
        logs: body?.logs ?? [],
        isLoading: false,
        error: null
      });
    } catch (caught) {
      setHistoryPopup({
        movimento,
        logs: [],
        isLoading: false,
        error: caught instanceof Error ? caught.message : "Não foi possível carregar o histórico."
      });
    }
  };

  const movementRowClass = (movimento: MovimentoDetalhe) =>
    [
      isPendingPayment(movimento) ? "pending-payment-row" : "",
      targetMovementParam === movimento.id ? "target-movement-row" : ""
    ]
      .filter(Boolean)
      .join(" ");

  const renderMovementActions = (movimento: MovimentoDetalhe) => {
    const locked = isMovementLocked(movimento);

    if (locked) {
      return (
        <div className="row-actions">
          <button type="button" onClick={() => openMovementHistory(movimento)}>
            Histórico
          </button>
          <span className="locked-row-note">Fechado</span>
        </div>
      );
    }

    return (
      <div className="row-actions">
        <button type="button" onClick={() => openMovementHistory(movimento)}>
          Histórico
        </button>
        {mayWrite ? (
          <button type="button" onClick={() => openEditMovement(movimento)}>
            Editar
          </button>
        ) : null}
        {mayDelete ? (
          <button className="danger-button" disabled={isSaving} type="button" onClick={() => deleteMovement(movimento)}>
            Apagar
          </button>
        ) : null}
      </div>
    );
  };

  const renderDescription = (movimento: MovimentoDetalhe) => {
    if (!movimento.descricao) return "—";
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
      setJustification("");
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
        <TopbarBrand logo={appLogo} title="Tesouraria" />
        <TopbarActions active="tesouraria" pendingPaymentsCount={pendingPayments.length} session={session} />
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
            aria-selected={sectionMode === "patrocinios"}
            className={sectionMode === "patrocinios" ? "section-tab active" : "section-tab"}
            onClick={() => switchSection("patrocinios")}
            role="tab"
            type="button"
          >
            Patrocínios
          </button>
          <button
            aria-selected={sectionMode === "peditorio"}
            className={sectionMode === "peditorio" ? "section-tab active" : "section-tab"}
            onClick={() => switchSection("peditorio")}
            role="tab"
            type="button"
          >
            Peditório
          </button>
          <button
            aria-selected={sectionMode === "contas"}
            className={sectionMode === "contas" ? "section-tab active" : "section-tab"}
            onClick={() => switchSection("contas")}
            role="tab"
            type="button"
          >
            Conta
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
            mayWrite ? (
              <button type="button" onClick={openCreateEvent}>
                Novo evento
              </button>
            ) : null
          ) : sectionMode === "contas" ? (
            <div className="account-menu-summary">
              <span>Conta Q26</span>
              <strong>{formatMoney(accountBalance)}</strong>
            </div>
          ) : (
            <div className="account-menu-summary">
              <span>{selectedSectionLabel}</span>
              <strong className={(selectedEvent?.saldo ?? 0) >= 0 ? "positive" : "negative"}>
                {selectedEvent ? formatMoney(selectedEvent.saldo) : "Sem dados"}
              </strong>
            </div>
          )}
          {sectionMode === "eventos" ? (
            <div className="menu-info-pill" aria-label={`${totals.isentos} eventos isentos`}>
              <span>Eventos isentos</span>
              <strong>{totals.isentos}</strong>
            </div>
          ) : null}
          <button className="secondary-menu-button" type="button" onClick={resetFilters}>
            Limpar
          </button>
        </div>
      </section>

      {saveMessage ? <section className="notice">{saveMessage}</section> : null}

      {error ? <section className="notice">Não consegui ligar ao Supabase. {error}</section> : null}

      <section className="metrics" aria-label="Resumo financeiro">
        {isAccountSection ? (
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
              <strong className={accountBalance >= 0 ? "metric-positive" : "metric-negative"}>{formatMoney(accountBalance)}</strong>
            </article>
            <article>
              <span>Movimentos</span>
              <strong>{accountCounts.entradas + accountCounts.saidas}</strong>
            </article>
          </>
        ) : specialSectionTotals ? (
          <>
            <article className="metric-income-card">
              <span>Entradas</span>
              <strong>{formatMoney(specialSectionTotals.entradas)}</strong>
            </article>
            <article className="metric-expense-card">
              <span>Saídas</span>
              <strong>{formatMoney(specialSectionTotals.saidas)}</strong>
            </article>
            {specialSectionTotals.aPagamento > 0 ? (
              <article className="payment-status-card is-due">
                <Link className="payment-card-link" href="/a-pagar">
                  <span>Pagamentos em falta</span>
                  <strong>{formatMoney(specialSectionTotals.aPagamento)}</strong>
                </Link>
              </article>
            ) : null}
            <article className="metric-balance-card">
              <span>Saldo {selectedSectionLabel}</span>
              <strong className={specialSectionTotals.saldo >= 0 ? "metric-positive" : "metric-negative"}>
                {formatMoney(specialSectionTotals.saldo)}
              </strong>
            </article>
            <article>
              <span>Movimentos</span>
              <strong>{eventMovimentos.filter(isMovementCounted).length}</strong>
            </article>
          </>
        ) : (
          <>
            <article className={`cash-check-card ${physicalCashDifference === null || physicalCashDifference >= 0 ? "is-positive" : "is-negative"}`}>
              <span>Dif. Dinheiro Físico</span>
              <form className="cash-count-form" onSubmit={savePhysicalCashCount}>
                <label>
                  <span>Dinheiro físico contado</span>
                  <input
                    disabled={!mayWrite || isSavingPhysicalCash}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={physicalCashInput}
                    onChange={(event) => {
                      setPhysicalCashInput(event.target.value);
                      setPhysicalCashMessage(null);
                    }}
                  />
                </label>
                {mayWrite ? (
                  <button disabled={isSavingPhysicalCash} type="submit">
                    {isSavingPhysicalCash ? "..." : "Guardar"}
                  </button>
                ) : null}
              </form>
              <strong className={physicalCashDifference === null || physicalCashDifference >= 0 ? "metric-positive" : "metric-negative"}>
                {physicalCashDifference === null ? "—" : formatMoney(physicalCashDifference)}
              </strong>
              <small>Contado - Valor Dinheiro</small>
              {physicalCashMessage ? <em>{physicalCashMessage}</em> : null}
            </article>
            <article className="metric-income-card">
              <span>Entradas</span>
              <strong>{formatMoney(totals.entradas)}</strong>
            </article>
            <article className="metric-expense-card">
              <span>Saídas</span>
              <strong>{formatMoney(totals.saidas)}</strong>
            </article>
            <article className={`payment-status-card ${totals.aPagamento > 0 ? "is-due" : "is-clear"}`}>
              <Link className="payment-card-link" href="/a-pagar">
                <span>Pagamentos em falta</span>
                <strong>{formatMoney(totals.aPagamento)}</strong>
              </Link>
            </article>
            <article className="metric-balance-card">
              <span>Saldo</span>
              <strong className={eventProfit >= 0 ? "metric-positive" : "metric-negative"}>{formatMoney(eventProfit)}</strong>
            </article>
            <article className="metric-section-card metric-events-card">
              <span>Eventos</span>
              <strong className={regularEventTotals.saldo >= 0 ? "metric-positive" : "metric-negative"}>
                {formatMoney(regularEventTotals.saldo)}
              </strong>
            </article>
            <article className="metric-section-card metric-sponsor-card">
              <span>Patrocínios</span>
              <strong className={sponsorTotals.saldo >= 0 ? "metric-positive" : "metric-negative"}>
                {formatMoney(sponsorTotals.saldo)}
              </strong>
            </article>
            <article className="metric-section-card metric-peditorio-card">
              <span>Peditório</span>
              <strong className={peditorioTotals.saldo >= 0 ? "metric-positive" : "metric-negative"}>
                {formatMoney(peditorioTotals.saldo)}
              </strong>
            </article>
            {showQ25ProfitCard ? (
              <article>
                <span>Lucro + Montante Q25</span>
                <strong className={profitWithQ25Balance >= 0 ? "metric-positive" : "metric-negative"}>
                  {formatMoney(profitWithQ25Balance)}
                </strong>
              </article>
            ) : null}
            <article>
              <span>Valor Dinheiro</span>
              <strong className={cashValue >= 0 ? "metric-positive" : "metric-negative"}>{formatMoney(cashValue)}</strong>
            </article>
          </>
        )}
      </section>

      {!isAccountSection ? (
      <section className={sectionMode === "eventos" ? "workspace" : "workspace single-panel"}>
        {sectionMode === "eventos" ? (
          <aside className="event-list" aria-label="Eventos e categorias" role="tablist">
            {orderedEventos.map((event) => (
              <button
                aria-selected={selectedEvent?.slug === event.slug}
                className={[
                  "event-card",
                  selectedEvent?.slug === event.slug ? "selected" : "",
                  event.cor && getEventColorOption(event.cor) ? "has-event-color" : "",
                  isEventClosed(event) ? "locked" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={event.slug}
                role="tab"
                style={eventCardStyle(event)}
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
                {!isEventCounted(event) ? <span className="event-status-badge">Só registo</span> : null}
                {isEventClosed(event) ? (
                  <span className="event-lock-badge compact">
                    <span className="event-lock-glyph" aria-hidden="true" />
                    Fechado
                  </span>
                ) : null}
                <span className={Number(event.saldo) >= 0 ? "event-balance positive" : "event-balance negative"}>
                  {formatMoney(event.saldo)}
                </span>
              </button>
            ))}
          </aside>
        ) : null}

        <section className="table-panel" aria-label="Movimentos do evento">
          {selectedEvent ? (
            <>
              <div className="event-detail">
                <div>
                  <p className="eyebrow">
                    {selectedSpecialSection?.label ?? (selectedEvent.tipo === "evento" ? "Evento" : "Categoria")}
                  </p>
                  <h2>{selectedEvent.nome}</h2>
                  <span className="event-meta">
                    {selectedEvent.tipo === "evento" ? formatDate(selectedEvent.data_inicio) : selectedEvent.folha_excel}
                    {" · Isento: "}
                    {isEventIsento(selectedEvent) ? "Sim" : "Não"}
                    {" · Totais: "}
                    {isEventCounted(selectedEvent) ? "Sim" : "Não"}
                  </span>
                  {!isEventCounted(selectedEvent) ? (
                    <span className="event-status-badge detail">Só registo, não entra nos totais gerais</span>
                  ) : null}
                  {selectedEventClosed ? (
                    <span className="event-lock-badge detail">
                      <span className="event-lock-glyph" aria-hidden="true" />
                      Fechado, desbloquear no Admin
                    </span>
                  ) : null}
                </div>
                <div className="event-side">
                  <div className="event-totals">
                    <span>Saldo</span>
                    <strong className={Number(selectedEvent.saldo) >= 0 ? "positive" : "negative"}>
                      {formatMoney(selectedEvent.saldo)}
                    </strong>
                  </div>
                  <div className="event-actions">
                    {selectedEventClosed ? <span className="event-locked-note">Evento fechado</span> : null}
                    {mayWrite && !selectedEventClosed ? (
                      <>
                        <button type="button" onClick={() => openQuickAdd("entrada")}>
                          Adicionar entrada
                        </button>
                        <button type="button" onClick={() => openQuickAdd("saida")}>
                          Adicionar saída
                        </button>
                        <button className="secondary-event-button" disabled={!selectedEvent} type="button" onClick={openEditEvent}>
                          Editar evento
                        </button>
                        {mayDelete ? (
                          <button className="danger-button" disabled={isSaving} type="button" onClick={deleteEvent}>
                            Apagar evento
                          </button>
                        ) : null}
                        {mayAccessAdmin ? (
                          <button className="secondary-event-button close-event-button" disabled={isSaving} type="button" onClick={closeSelectedEvent}>
                            Fechar evento
                          </button>
                        ) : null}
                      </>
                    ) : null}
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

              <section className="event-ratio-panel" aria-label="Percentagem de entradas e despesas">
                <div className="event-ratio-heading">
                  <span>Entradas vs Despesas</span>
                  <strong>
                    {eventMovementRatio.entradasPercent}% / {eventMovementRatio.saidasPercent}%
                  </strong>
                </div>
                <div className="event-ratio-bar" aria-hidden="true">
                  <i
                    className="event-ratio-entradas"
                    style={{ width: `${eventMovementRatio.entradasPercent}%` }}
                  />
                  <i className="event-ratio-saidas" style={{ width: `${eventMovementRatio.saidasPercent}%` }} />
                </div>
                <div className="event-ratio-legend">
                  <span>
                    <i className="event-ratio-dot entradas" />
                    Entradas {eventMovementRatio.entradasPercent}%
                  </span>
                  <span>
                    <i className="event-ratio-dot saidas" />
                    Despesas {eventMovementRatio.saidasPercent}%
                  </span>
                </div>
              </section>

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
                <div className="table-heading-actions">
                  {activeTab === "entrada" ? (
                    <div className="entry-payment-breakdown" aria-label="Resumo por método de entrada">
                      <span>
                        <small>Valor Dinheiro</small>
                        <strong>{formatMoney(tabCounts.totalEntradasDinheiro)}</strong>
                      </span>
                      <span>
                        <small>Valor Multibanco</small>
                        <strong>{formatMoney(tabCounts.totalEntradasMultibanco)}</strong>
                      </span>
                      <span>
                        <small>Valor Transferências</small>
                        <strong>{formatMoney(tabCounts.totalEntradasTransferencia)}</strong>
                      </span>
                      <span>
                        <small>Valor Fat.Finanças</small>
                        <strong>{formatMoney(tabCounts.totalValorTeorico)}</strong>
                      </span>
                    </div>
                  ) : null}
                  <span>
                    {formatMoney(activeTab === "entrada" ? tabCounts.totalEntradas : tabCounts.totalSaidas)}
                  </span>
                  {mayWrite && !selectedEventClosed ? (
                    <button
                      aria-label={`Adicionar ${activeTab === "entrada" ? "entrada" : "saída"}`}
                      className="inline-add-button"
                      type="button"
                      onClick={() => openQuickAdd(activeTab)}
                    >
                      +
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="table-wrap">
                <table className={activeTab === "entrada" ? "entries-table" : "outgoing-table"}>
                  <thead>
                    {activeTab === "entrada" ? (
                      <tr>
                        <th>Item</th>
                        <th>Descrição</th>
                        <th>Data</th>
                        <th>Método</th>
                        <th>Tipo</th>
                        <th>Fatura emitida</th>
                        <th>Montante</th>
                        <th>Valor teórico</th>
                        <th>Ações</th>
                      </tr>
                    ) : (
                      <tr>
                        <th>Tipo</th>
                        <th>Item</th>
                        <th>Descrição</th>
                        <th>Data</th>
                        <th>Montante</th>
                        <th>Pagamento</th>
                        <th>Fatura</th>
                        <th>Fatura C/NIF</th>
                        <th>Faturar depois</th>
                        <th>Pago</th>
                        <th>Totais gerais</th>
                        <th>Ações</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {mayWrite && !selectedEventClosed && quickAddTab === activeTab ? (
                      activeTab === "entrada" ? (
                        <tr className="inline-add-row">
                          <td className="item-cell">
                            <input
                              aria-label="Item da entrada"
                              autoFocus
                              value={quickMovementForm.item}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, item: event.target.value }))
                              }
                              placeholder="Item"
                            />
                          </td>
                          <td>
                            <input
                              aria-label="Descrição da entrada"
                              value={quickMovementForm.descricao}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, descricao: event.target.value }))
                              }
                              placeholder="Descrição"
                            />
                          </td>
                          <td>
                            <input
                              aria-label="Data da entrada"
                              type="date"
                              value={quickMovementForm.data_pagamento}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, data_pagamento: event.target.value }))
                              }
                            />
                          </td>
                          <td>
                            <select
                              aria-label="Método da entrada"
                              value={quickMovementForm.tipo_pagamento}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({
                                  ...current,
                                  tipo_pagamento: event.target.value
                                }))
                              }
                            >
                              <option value="Dinheiro">Dinheiro</option>
                              <option value="Multibanco">Multibanco</option>
                              <option value="Transferencia">Transferencia</option>
                            </select>
                          </td>
                          <td>
                            <select
                              aria-label="Tipo da entrada"
                              value={quickMovementForm.tipo_entrada}
                              onChange={(event) => {
                                const entryKind = event.target.value as EntryKind;
                                const isSponsor = entryKind === "patrocinio";
                                setQuickMovementForm((current) => ({
                                  ...current,
                                  tipo_entrada: entryKind,
                                  precisa_fatura: entryKind === "faturacao" ? current.precisa_fatura : false,
                                  patrocinio: isSponsor,
                                  fatura_emitida:
                                    isSponsor || (entryKind === "faturacao" && current.precisa_fatura) ? current.fatura_emitida : "nao"
                                }));
                              }}
                            >
                              {ENTRY_KIND_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div className="invoice-need-cell">
                              {quickMovementForm.tipo_entrada === "faturacao" ? (
                                <label className="table-checkbox">
                                  <input
                                    checked={quickMovementForm.precisa_fatura}
                                    type="checkbox"
                                    onChange={(event) =>
                                      setQuickMovementForm((current) => ({
                                        ...current,
                                        precisa_fatura: event.target.checked,
                                        fatura_emitida: event.target.checked ? current.fatura_emitida : "nao"
                                      }))
                                    }
                                  />
                                  <span>Precisa fatura</span>
                                </label>
                              ) : null}
                              {formNeedsInvoice(quickMovementForm) ? (
                                <select
                                  aria-label="Fatura emitida"
                                  value={quickMovementForm.fatura_emitida}
                                  onChange={(event) =>
                                    setQuickMovementForm((current) => ({
                                      ...current,
                                      fatura_emitida: event.target.value as MovementForm["fatura_emitida"]
                                    }))
                                  }
                                >
                                  <option value="nao">Não</option>
                                  <option value="sim">Sim</option>
                                </select>
                              ) : (
                                "—"
                              )}
                            </div>
                          </td>
                          <td>
                            <input
                              aria-label="Montante da entrada"
                              inputMode="decimal"
                              value={quickMovementForm.montante}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, montante: event.target.value }))
                              }
                              placeholder="0,00"
                            />
                          </td>
                          <td>
                            <input
                              aria-label="Valor teórico da entrada"
                              inputMode="decimal"
                              value={quickMovementForm.valor_teorico}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, valor_teorico: event.target.value }))
                              }
                              placeholder="0,00"
                            />
                          </td>
                          <td>
                            <div className="row-actions">
                              <button disabled={isSaving} type="button" onClick={saveQuickMovement}>
                                Guardar
                              </button>
                              <button disabled={isSaving} type="button" onClick={closeQuickAdd}>
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr className="inline-add-row">
                          <td>
                            <span className="pill saida">Saída</span>
                          </td>
                          <td className="item-cell">
                            <input
                              aria-label="Item da saída"
                              autoFocus
                              value={quickMovementForm.item}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, item: event.target.value }))
                              }
                              placeholder="Item"
                            />
                          </td>
                          <td>
                            <input
                              aria-label="Descrição da saída"
                              value={quickMovementForm.descricao}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, descricao: event.target.value }))
                              }
                              placeholder="Descrição"
                            />
                          </td>
                          <td>
                            <input
                              aria-label="Data de pagamento"
                              type="date"
                              value={quickMovementForm.data_pagamento}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, data_pagamento: event.target.value }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              aria-label="Montante da saída"
                              inputMode="decimal"
                              value={quickMovementForm.montante}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, montante: event.target.value }))
                              }
                              placeholder="0,00"
                            />
                          </td>
                          <td>
                            <select
                              aria-label="Tipo de pagamento"
                              value={quickMovementForm.tipo_pagamento}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, tipo_pagamento: event.target.value }))
                              }
                            >
                              <option value="">—</option>
                              <option value="Dinheiro">Dinheiro</option>
                              <option value="C. Q26">C. Q26</option>
                              <option value="Transferencia">Transferencia</option>
                            </select>
                          </td>
                          <td>
                            <input
                              aria-label="Número da fatura"
                              value={quickMovementForm.numero_fatura}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, numero_fatura: event.target.value }))
                              }
                              placeholder="Nº"
                            />
                          </td>
                          <td>
                            <select
                              aria-label="Fatura com NIF"
                              value={quickMovementForm.fatura_com_nif}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({
                                  ...current,
                                  fatura_com_nif: event.target.value as MovementForm["fatura_com_nif"]
                                }))
                              }
                            >
                              <option value="">—</option>
                              <option value="sim">Sim</option>
                              <option value="nao">Não</option>
                            </select>
                          </td>
                          <td>
                            <label className="table-checkbox" title="Mostrar este item em Fat.Finanças > Itens a acrescentar">
                              <input
                                aria-label="Faturar mais tarde"
                                checked={quickMovementForm.faturar_mais_tarde}
                                type="checkbox"
                                onChange={(event) =>
                                  setQuickMovementForm((current) => ({
                                    ...current,
                                    faturar_mais_tarde: event.target.checked
                                  }))
                                }
                              />
                              <span>{quickMovementForm.faturar_mais_tarde ? "Sim" : "Não"}</span>
                            </label>
                          </td>
                          <td>
                            <select
                              aria-label="Pago"
                              value={quickMovementForm.pago}
                              onChange={(event) =>
                                setQuickMovementForm((current) => ({ ...current, pago: event.target.value as MovementForm["pago"] }))
                              }
                            >
                              <option value="">—</option>
                              <option value="sim">Sim</option>
                              <option value="nao">Não</option>
                            </select>
                          </td>
                          <td>
                            <label className="table-checkbox" title="Contabilizar esta saída nos totais gerais">
                              <input
                                aria-label="Contabilizar nos totais gerais"
                                checked={quickMovementForm.contabilizar_totais}
                                type="checkbox"
                                onChange={(event) =>
                                  setQuickMovementForm((current) => ({
                                    ...current,
                                    contabilizar_totais: event.target.checked
                                  }))
                                }
                              />
                              <span>{quickMovementForm.contabilizar_totais ? "Sim" : "Não"}</span>
                            </label>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button disabled={isSaving} type="button" onClick={saveQuickMovement}>
                                Guardar
                              </button>
                              <button disabled={isSaving} type="button" onClick={closeQuickAdd}>
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    ) : null}
                    {filteredMovimentos.map((movimento) => (
                      activeTab === "entrada" ? (
                        <tr className={movementRowClass(movimento)} key={movimento.id}>
                          <td className="item-cell">{movimento.item}</td>
                          <td>{renderDescription(movimento)}</td>
                          <td>{formatDate(movimento.data_pagamento)}</td>
                          <td>{entryPaymentLabel(movimento)}</td>
                          <td>{entryKindLabel(movementEntryKind(movimento))}</td>
                          <td>{needsEntryInvoice(movimento) ? yesNo(isInvoiceIssued(movimento)) : "—"}</td>
                          <td className="money">{formatMoney(movimento.montante)}</td>
                          <td className="money">{formatMoney(theoreticalEntryAmount(movimento))}</td>
                          <td>{renderMovementActions(movimento)}</td>
                        </tr>
                      ) : (
                        <tr className={movementRowClass(movimento)} key={movimento.id}>
                          <td>
                            <span className={`pill ${movimento.tipo}`}>{movementLabel(movimento.tipo)}</span>
                          </td>
                          <td className="item-cell">{movimento.item}</td>
                          <td>{renderDescription(movimento)}</td>
                          <td>{formatDate(movimento.data_pagamento)}</td>
                          <td className="money">{formatMoney(movimento.montante)}</td>
                          <td>{movimento.tipo_pagamento ?? "—"}</td>
                          <td>{movimento.numero_fatura ?? "—"}</td>
                          <td>{movimento.fatura_com_nif === null ? "—" : movimento.fatura_com_nif ? "Sim" : "Não"}</td>
                          <td>{isMarkedForLaterInvoice(movimento) ? "Sim" : "Não"}</td>
                          <td>{movimento.pago === null ? "—" : movimento.pago ? "Sim" : "Não"}</td>
                          <td>{isMovementCounted(movimento) ? "Sim" : "Não"}</td>
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
              <p className="eyebrow">{selectedSectionLabel}</p>
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
                {accountEvent
                  ? "Movimentos da folha Contas, entradas por Multibanco ou Transferencia e despesas por Transferência ou C. Q26"
                  : "Sem folha Contas carregada"}
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
              onClick={() => {
                setActiveTab("saida");
                setAccountQuickAddOpen(false);
              }}
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
            <div className="table-heading-actions">
              <span>
                {formatMoney(activeTab === "entrada" ? accountCounts.totalEntradas : accountCounts.totalSaidas)}
              </span>
              {mayWrite && activeTab === "entrada" ? (
                <button
                  className="account-deposit-button"
                  disabled={!accountEvent || accountEventClosed || isSaving}
                  onClick={openAccountDepositAdd}
                  type="button"
                >
                  Adicionar depósito
                </button>
              ) : null}
            </div>
          </div>

          <div className="table-wrap">
            <table className={activeTab === "entrada" ? "entries-table account-entries-table" : "outgoing-table"}>
              <thead>
                {activeTab === "entrada" ? (
                  <tr>
                    <th>Evento</th>
                    <th>Item</th>
                    <th>Descrição</th>
                    <th>Data</th>
                    <th>Método</th>
                    <th>Tipo</th>
                    <th>Fatura emitida</th>
                    <th>Montante</th>
                    <th>Ações</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Evento</th>
                    <th>Item</th>
                    <th>Descrição</th>
                    <th>Data</th>
                    <th>Montante</th>
                    <th>Pagamento</th>
                    <th>Fatura C/NIF</th>
                    <th>Pago</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {mayWrite && activeTab === "entrada" && accountQuickAddOpen ? (
                  <tr className="inline-add-row account-inline-add-row">
                    <td>Conta Q26</td>
                    <td className="item-cell">
                      <input
                        aria-label="Item do depósito"
                        autoFocus
                        value={accountMovementForm.item}
                        onChange={(event) =>
                          setAccountMovementForm((current) => ({ ...current, item: event.target.value }))
                        }
                        placeholder="Depósito"
                      />
                    </td>
                    <td>
                      <input
                        aria-label="Descrição do depósito"
                        value={accountMovementForm.descricao}
                        onChange={(event) =>
                          setAccountMovementForm((current) => ({ ...current, descricao: event.target.value }))
                        }
                        placeholder="Descrição"
                      />
                    </td>
                    <td>
                      <input
                        aria-label="Data do depósito"
                        type="date"
                        value={accountMovementForm.data_pagamento}
                        onChange={(event) =>
                          setAccountMovementForm((current) => ({ ...current, data_pagamento: event.target.value }))
                        }
                      />
                    </td>
                    <td>Conta Q26</td>
                    <td>Depósito</td>
                    <td>—</td>
                    <td>
                      <input
                        aria-label="Montante do depósito"
                        inputMode="decimal"
                        value={accountMovementForm.montante}
                        onChange={(event) =>
                          setAccountMovementForm((current) => ({ ...current, montante: event.target.value }))
                        }
                        placeholder="0,00"
                      />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button disabled={isSaving} type="button" onClick={saveAccountDeposit}>
                          Guardar
                        </button>
                        <button disabled={isSaving} type="button" onClick={closeAccountQuickAdd}>
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {filteredAccountMovimentos.map((movimento) => (
                  activeTab === "entrada" ? (
                    <tr className={movementRowClass(movimento)} key={movimento.id}>
                      <td>{movimento.evento_nome}</td>
                      <td className="item-cell">{movimento.item}</td>
                      <td>{renderDescription(movimento)}</td>
                      <td>{formatDate(movimento.data_pagamento)}</td>
                      <td>{accountEntryLabel(movimento)}</td>
                      <td>{entryKindLabel(movementEntryKind(movimento))}</td>
                      <td>{needsEntryInvoice(movimento) ? yesNo(isInvoiceIssued(movimento)) : "—"}</td>
                      <td className="money">{formatMoney(movimento.montante)}</td>
                      <td>{renderMovementActions(movimento)}</td>
                    </tr>
                  ) : (
                    <tr className={movementRowClass(movimento)} key={movimento.id}>
                      <td>{movimento.evento_nome}</td>
                      <td className="item-cell">{movimento.item}</td>
                      <td>{renderDescription(movimento)}</td>
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
                <label>
                  Contabilizar nos totais
                  <select
                    value={eventForm.contabilizar_totais}
                    onChange={(event) =>
                      setEventForm((current) => ({
                        ...current,
                        contabilizar_totais: event.target.value as EventForm["contabilizar_totais"]
                      }))
                    }
                  >
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </label>
                <div className="event-color-field full">
                  <span>Cor do evento</span>
                  <div className="event-color-options" role="radiogroup" aria-label="Cor do evento">
                    {EVENT_COLOR_OPTIONS.map((option) => (
                      <button
                        aria-checked={eventForm.cor === option.value}
                        className={eventForm.cor === option.value ? "event-color-option selected" : "event-color-option"}
                        key={option.value || "default"}
                        onClick={() => setEventForm((current) => ({ ...current, cor: option.value }))}
                        role="radio"
                        style={eventColorStyle(option)}
                        type="button"
                      >
                        <span className="event-color-swatch" />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
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
                {modalMode === "add-entry" || modalMode === "edit-entry" ? (
                  <label>
                    Valor teórico
                    <input
                      inputMode="decimal"
                      value={movementForm.valor_teorico}
                      onChange={(event) => setMovementForm((current) => ({ ...current, valor_teorico: event.target.value }))}
                      placeholder="0,00"
                    />
                  </label>
                ) : null}
                {modalMode === "add-entry" || modalMode === "edit-entry" ? (
                  <label>
                    Data da entrada
                    <input
                      type="date"
                      value={movementForm.data_pagamento}
                      onChange={(event) =>
                        setMovementForm((current) => ({ ...current, data_pagamento: event.target.value }))
                      }
                    />
                  </label>
                ) : null}
                {(modalMode === "add-entry" || modalMode === "edit-entry") && selectedMovement?.evento_slug !== "contas" ? (
                  <label>
                    Método da entrada
                    <select
                      value={movementForm.tipo_pagamento || "Dinheiro"}
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          tipo_pagamento: event.target.value
                        }))
                      }
                    >
                      <option value="Dinheiro">Dinheiro</option>
                      <option value="Multibanco">Multibanco</option>
                      <option value="Transferencia">Transferencia</option>
                    </select>
                  </label>
                ) : null}
                {modalMode === "add-entry" || modalMode === "edit-entry" ? (
                  <>
                    <label>
                      Tipo
                      <select
                        value={movementForm.tipo_entrada}
                        onChange={(event) => {
                          const entryKind = event.target.value as EntryKind;
                          const isSponsor = entryKind === "patrocinio";
                          setMovementForm((current) => ({
                            ...current,
                            tipo_entrada: entryKind,
                            precisa_fatura: entryKind === "faturacao" ? current.precisa_fatura : false,
                            patrocinio: isSponsor,
                            fatura_emitida:
                              isSponsor || (entryKind === "faturacao" && current.precisa_fatura) ? current.fatura_emitida : "nao"
                          }));
                        }}
                      >
                        {ENTRY_KIND_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {movementForm.tipo_entrada === "faturacao" ? (
                      <label className="checkbox-field">
                        <input
                          checked={movementForm.precisa_fatura}
                          type="checkbox"
                          onChange={(event) =>
                            setMovementForm((current) => ({
                              ...current,
                              precisa_fatura: event.target.checked,
                              fatura_emitida: event.target.checked ? current.fatura_emitida : "nao"
                            }))
                          }
                        />
                        <span>Precisa de fatura</span>
                      </label>
                    ) : null}
                    {formNeedsInvoice(movementForm) ? (
                      <label>
                        Fatura emitida
                        <select
                          value={movementForm.fatura_emitida}
                          onChange={(event) =>
                            setMovementForm((current) => ({
                              ...current,
                              fatura_emitida: event.target.value as MovementForm["fatura_emitida"]
                            }))
                          }
                        >
                          <option value="nao">Não</option>
                          <option value="sim">Sim</option>
                        </select>
                      </label>
                    ) : null}
                    <label className="full">
                      Descrição
                      <textarea
                        value={movementForm.descricao}
                        onChange={(event) => setMovementForm((current) => ({ ...current, descricao: event.target.value }))}
                        placeholder="Descrição da entrada"
                      />
                    </label>
                  </>
                ) : null}
                {modalMode === "add-exit" || modalMode === "edit-exit" ? (
                  <>
                    <label className="full">
                      Descrição
                      <textarea
                        value={movementForm.descricao}
                        onChange={(event) => setMovementForm((current) => ({ ...current, descricao: event.target.value }))}
                        placeholder="Descrição da despesa"
                      />
                    </label>
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
                    <label className="checkbox-field">
                      <input
                        checked={movementForm.faturar_mais_tarde}
                        type="checkbox"
                        onChange={(event) =>
                          setMovementForm((current) => ({ ...current, faturar_mais_tarde: event.target.checked }))
                        }
                      />
                      <span>Faturar mais tarde</span>
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
                    <label className="checkbox-field full">
                      <input
                        checked={movementForm.contabilizar_totais}
                        type="checkbox"
                        onChange={(event) =>
                          setMovementForm((current) => ({ ...current, contabilizar_totais: event.target.checked }))
                        }
                      />
                      <span>Contabilizar esta saída nos totais gerais</span>
                    </label>
                  </>
                ) : null}
              </div>
            )}

            {mustJustify &&
            (modalMode === "edit-event" || modalMode === "edit-entry" || modalMode === "edit-exit") ? (
              <label className="justification-field">
                Justificação da alteração
                <textarea
                  required
                  value={justification}
                  onChange={(event) => setJustification(event.target.value)}
                  placeholder="Indica o motivo antes de gravar"
                />
              </label>
            ) : null}

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

      {historyPopup ? (
        <div className="modal-backdrop" role="presentation">
          <section aria-modal="true" className="modal movement-history-modal" role="dialog">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Histórico de versões</p>
                <h2>{historyPopup.movimento.item}</h2>
                <span className="history-modal-subtitle">
                  {historyPopup.movimento.evento_nome} · {movementLabel(historyPopup.movimento.tipo)}
                </span>
              </div>
              <button aria-label="Fechar" className="icon-button" onClick={() => setHistoryPopup(null)} type="button">
                ×
              </button>
            </div>

            {historyPopup.isLoading ? <p className="form-message">A carregar histórico...</p> : null}
            {historyPopup.error ? <p className="form-message">Não foi possível carregar o histórico. {historyPopup.error}</p> : null}

            {!historyPopup.isLoading && !historyPopup.error && !historyPopup.logs.length ? (
              <div className="empty-history-state">
                <strong>Ainda não há versões registadas para este movimento.</strong>
                <span>As próximas criações, alterações e eliminações ficam registadas automaticamente.</span>
              </div>
            ) : null}

            {!historyPopup.isLoading && historyPopup.logs.length ? (
              <div className="movement-history-list">
                {historyPopup.logs.map((log) => {
                  const before = movementHistorySnapshot(log, "before");
                  const after = movementHistorySnapshot(log, "after");
                  const fallback = movementHistoryFallbackSnapshot(log);
                  const fields = historyChangedFields(before, after ?? fallback);
                  const justificationText = movementHistoryJustification(log);

                  return (
                    <article className="movement-history-entry" key={log.id}>
                      <header>
                        <div>
                          <strong>{log.action}</strong>
                          <span>{log.summary ?? "Movimento alterado"}</span>
                        </div>
                        <small>
                          {formatDateTime(log.created_at)} · {log.username} · {getRoleLabel(log.role)}
                        </small>
                      </header>

                      {justificationText ? (
                        <p className="history-justification">
                          <strong>Justificação:</strong> {justificationText}
                        </p>
                      ) : null}

                      {fields.length ? (
                        <dl className="history-field-grid">
                          {fields.map(([field, label]) => {
                            const beforeValue = before ? before[field] : null;
                            const afterSource = after ?? fallback;
                            const afterValue = afterSource ? afterSource[field] : null;

                            return (
                              <div key={`${log.id}-${field}`}>
                                <dt>{label}</dt>
                                <dd>
                                  {before ? (
                                    <>
                                      <span>{formatHistoryValue(field, beforeValue)}</span>
                                      <i>→</i>
                                    </>
                                  ) : null}
                                  <strong>{formatHistoryValue(field, afterValue)}</strong>
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      ) : (
                        <p className="history-empty-diff">Registo sem campos detalhados para comparar.</p>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : null}

            <div className="modal-actions">
              <button type="button" onClick={() => setHistoryPopup(null)}>
                Fechar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

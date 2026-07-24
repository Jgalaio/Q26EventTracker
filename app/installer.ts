import { readFile } from "fs/promises";
import path from "path";
import { hashCredential, supabaseAdminHeaders, supabaseEndpoint } from "./auth";
import { BANK_ACCOUNT_LABEL } from "./payment-labels";

type InstallerCheck = {
  detail: string;
  id: string;
  label: string;
  ok: boolean;
};

export type InstallerStatus = {
  adminCount: number | null;
  canBootstrap: boolean;
  databaseChecks: InstallerCheck[];
  envChecks: InstallerCheck[];
  installed: boolean;
  installation: Record<string, unknown> | null;
  missingDatabaseObjects: string[];
  schemaReady: boolean;
};

type JsonRecord = Record<string, unknown>;

const FALLBACK_SUPABASE_URL = "https://ushhacwtmpmwmvpaitdx.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";
const DEFAULT_AUTH_SECRET = "q26-event-tracker-change-this-secret";
const EXAMPLE_AUTH_SECRET = "troca-este-valor-por-um-segredo-longo";
const INSTALLATION_SETTING_KEY = "app_installation";

const REQUIRED_DATABASE_OBJECTS = [
  { id: "eventos", label: "Tabela eventos", resource: "eventos?select=id&limit=1" },
  { id: "movimentos", label: "Tabela movimentos", resource: "movimentos?select=id&limit=1" },
  { id: "app_users", label: "Tabela utilizadores", resource: "app_users?select=username&limit=1" },
  { id: "app_settings", label: "Tabela definições", resource: "app_settings?select=key&limit=1" },
  { id: "app_audit_logs", label: "Tabela log", resource: "app_audit_logs?select=id&limit=1" },
  { id: "notas", label: "Tabela TODO", resource: "notas?select=id&limit=1" },
  { id: "faturas_relatorios", label: "Tabela relatórios de faturas", resource: "faturas_relatorios?select=id&limit=1" },
  { id: "eventos_resumo", label: "Vista resumo de eventos", resource: "eventos_resumo?select=id&limit=1" },
  { id: "movimentos_detalhe", label: "Vista detalhe de movimentos", resource: "movimentos_detalhe?select=id&limit=1" }
];

const BASE_EVENTS = [
  {
    slug: "contas",
    nome: BANK_ACCOUNT_LABEL,
    folha_excel: BANK_ACCOUNT_LABEL,
    ordem_folha: 1,
    data_texto: null,
    data_inicio: null,
    data_fim: null,
    isento: false,
    isento_texto: "Não",
    contabilizar_totais: true,
    cor: "azul",
    fechado: false,
    tipo: "categoria"
  },
  {
    slug: "patrocinios-festa",
    nome: "Patrocínios",
    folha_excel: "Patrocínios",
    ordem_folha: 2,
    data_texto: null,
    data_inicio: null,
    data_fim: null,
    isento: false,
    isento_texto: "Não",
    contabilizar_totais: true,
    cor: "roxo",
    fechado: false,
    tipo: "categoria"
  },
  {
    slug: "peditorio",
    nome: "Peditório",
    folha_excel: "Peditório",
    ordem_folha: 3,
    data_texto: null,
    data_inicio: null,
    data_fim: null,
    isento: false,
    isento_texto: "Não",
    contabilizar_totais: true,
    cor: "amarelo",
    fechado: false,
    tipo: "categoria"
  }
] as const;

function rawEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function check(id: string, label: string, ok: boolean, detail: string): InstallerCheck {
  return { detail, id, label, ok };
}

function installerSecret() {
  return rawEnv("Q26_INSTALLER_SECRET") || rawEnv("INSTALLER_SECRET");
}

function environmentChecks() {
  const supabaseUrl = rawEnv("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = rawEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = rawEnv("SUPABASE_SERVICE_ROLE_KEY");
  const authSecret = rawEnv("Q26_AUTH_SECRET");
  const setupSecret = installerSecret();

  return [
    check(
      "supabase-url",
      "NEXT_PUBLIC_SUPABASE_URL",
      Boolean(supabaseUrl),
      supabaseUrl
        ? supabaseUrl === FALLBACK_SUPABASE_URL
          ? "Definido, mas confirma se pertence ao novo projeto."
          : `Ligado a ${supabaseUrl.replace(/^https?:\/\//, "")}`
        : "Falta indicar o URL do Supabase."
    ),
    check(
      "publishable-key",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      Boolean(publishableKey),
      publishableKey
        ? publishableKey === FALLBACK_SUPABASE_PUBLISHABLE_KEY
          ? "Definida, mas confirma se pertence ao novo projeto."
          : "Definida."
        : "Falta a publishable key do Supabase."
    ),
    check(
      "service-role-key",
      "SUPABASE_SERVICE_ROLE_KEY",
      Boolean(serviceRoleKey),
      serviceRoleKey ? "Definida no servidor." : "Obrigatória para criar o primeiro Admin."
    ),
    check(
      "auth-secret",
      "Q26_AUTH_SECRET",
      Boolean(authSecret && authSecret !== DEFAULT_AUTH_SECRET && authSecret !== EXAMPLE_AUTH_SECRET && authSecret.length >= 24),
      authSecret ? "Definida." : "Define um segredo longo para assinar sessões."
    ),
    check(
      "installer-secret",
      "Q26_INSTALLER_SECRET",
      Boolean(setupSecret && setupSecret.length >= 12),
      setupSecret ? "Definida." : "Protege o primeiro arranque do instalador."
    )
  ];
}

async function installerAdminRequest<T>(
  resource: string,
  method: string,
  body?: unknown,
  prefer = "return=representation"
) {
  const headers = supabaseAdminHeaders();
  if (!headers) throw new Error("missing_service_role_key");

  const response = await fetch(supabaseEndpoint(resource), {
    method,
    headers: {
      ...headers,
      Prefer: prefer
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store"
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${responseText}`);
  }

  return (responseText ? JSON.parse(responseText) : null) as T;
}

async function checkDatabaseObject(resource: string, id: string, label: string): Promise<InstallerCheck> {
  try {
    await installerAdminRequest(resource, "GET");
    return check(id, label, true, "Pronto.");
  } catch (error) {
    return check(id, label, false, error instanceof Error ? error.message : "Não foi possível verificar.");
  }
}

async function checkLoginFunction(): Promise<InstallerCheck> {
  try {
    await installerAdminRequest(
      "rpc/app_verify_login",
      "POST",
      { p_username: "__installer_check__", p_password: "__installer_check__" },
      "return=representation"
    );
    return check("app_verify_login", "Função de login", true, "Pronta.");
  } catch (error) {
    return check("app_verify_login", "Função de login", false, error instanceof Error ? error.message : "Não foi possível verificar.");
  }
}

async function adminCount() {
  const rows = await installerAdminRequest<Array<{ username?: string | null }>>(
    "app_users?role=eq.admin&select=username",
    "GET"
  );
  return rows.filter((row) => typeof row.username === "string" && row.username.trim()).length;
}

async function installationSetting() {
  try {
    const rows = await installerAdminRequest<Array<{ value?: unknown }>>(
      `app_settings?key=eq.${encodeURIComponent(INSTALLATION_SETTING_KEY)}&select=value&limit=1`,
      "GET"
    );
    const value = rows[0]?.value;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
  } catch {
    return null;
  }
}

export async function getInstallerStatus(): Promise<InstallerStatus> {
  const envChecks = environmentChecks();
  const hasSupabaseConfig = envChecks.find((item) => item.id === "supabase-url")?.ok &&
    envChecks.find((item) => item.id === "publishable-key")?.ok &&
    envChecks.find((item) => item.id === "service-role-key")?.ok;

  if (!hasSupabaseConfig) {
    return {
      adminCount: null,
      canBootstrap: false,
      databaseChecks: [],
      envChecks,
      installed: false,
      installation: null,
      missingDatabaseObjects: REQUIRED_DATABASE_OBJECTS.map((item) => item.id),
      schemaReady: false
    };
  }

  const databaseChecks = await Promise.all([
    ...REQUIRED_DATABASE_OBJECTS.map((item) => checkDatabaseObject(item.resource, item.id, item.label)),
    checkLoginFunction()
  ]);
  const missingDatabaseObjects = databaseChecks.filter((item) => !item.ok).map((item) => item.id);
  const schemaReady = missingDatabaseObjects.length === 0;
  const count = schemaReady ? await adminCount().catch(() => null) : null;
  const installed = schemaReady && typeof count === "number" && count > 0;

  return {
    adminCount: count,
    canBootstrap: schemaReady && !installed && envChecks.every((item) => item.ok),
    databaseChecks,
    envChecks,
    installed,
    installation: schemaReady ? await installationSetting() : null,
    missingDatabaseObjects,
    schemaReady
  };
}

export async function getInstallerSql() {
  const source = await readFile(path.join(process.cwd(), "supabase", "enable_public_writes.sql"), "utf8");
  const withoutBuiltInUsers = source.replace(
    /insert into public\.app_users \(username, role, password_hash\)[\s\S]*?on conflict \(username\) do nothing;\n*/m,
    "-- O primeiro Admin é criado pelo instalador depois deste SQL estar aplicado.\n\n"
  );
  const withEventRls = withoutBuiltInUsers.includes("alter table public.eventos enable row level security;")
    ? withoutBuiltInUsers
    : withoutBuiltInUsers.replace(
        "alter table public.app_users enable row level security;",
        [
          "alter table public.eventos enable row level security;",
          "alter table public.movimentos enable row level security;",
          "alter table public.app_users enable row level security;"
        ].join("\n")
      );

  return [
    "-- Tesouraria Q26 - schema limpo para first run",
    "-- Corre este SQL no Supabase SQL Editor antes de criares o primeiro Admin.",
    withEventRls.trim(),
    ""
  ].join("\n");
}

function cleanUsername(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export async function bootstrapFirstAdmin(usernameInput: unknown, passwordInput: unknown) {
  const username = cleanUsername(usernameInput);
  const password = typeof passwordInput === "string" ? passwordInput : "";
  if (!username) throw new Error("Indica o nome do primeiro utilizador Admin.");
  if (password.length < 6) throw new Error("A password deve ter pelo menos 6 caracteres.");

  const now = new Date().toISOString();
  const adminPayload = {
    username,
    role: "admin",
    password_hash: hashCredential(username, password),
    updated_at: now
  };

  await installerAdminRequest(
    "app_users?on_conflict=username",
    "POST",
    adminPayload,
    "resolution=merge-duplicates,return=representation"
  );

  await installerAdminRequest(
    "eventos?on_conflict=slug",
    "POST",
    BASE_EVENTS,
    "resolution=merge-duplicates,return=representation"
  );

  await installerAdminRequest(
    "app_settings?on_conflict=key",
    "POST",
    {
      key: INSTALLATION_SETTING_KEY,
      value: {
        installedAt: now,
        installedBy: username,
        mode: "first-run",
        seededBaseAreas: BASE_EVENTS.map((event) => event.slug)
      },
      updated_at: now
    },
    "resolution=merge-duplicates,return=minimal"
  );

  await installerAdminRequest(
    "app_audit_logs",
    "POST",
    {
      username,
      role: "admin",
      action: "Instalou aplicação",
      resource: "installer",
      resource_id: INSTALLATION_SETTING_KEY,
      summary: "Criou o primeiro Admin e preparou as áreas base",
      details: {
        seededBaseAreas: BASE_EVENTS.map((event) => event.slug)
      }
    },
    "return=minimal"
  ).catch(() => null);

  return { username };
}

export function installerSecretMatches(value: unknown) {
  const expected = installerSecret();
  return Boolean(expected && typeof value === "string" && value === expected);
}

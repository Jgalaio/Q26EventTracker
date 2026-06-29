import { NextResponse } from "next/server";
import { getSession, isRole, supabaseAdminHeaders, supabaseEndpoint } from "../../../auth";
import type { AuthSession, UserRole } from "../../../auth-types";

export type ManagedUser = {
  username: string;
  role: UserRole;
  updated_at: string | null;
};

type AdminAccess =
  | {
      session: AuthSession;
      error: null;
    }
  | {
      session: null;
      error: NextResponse;
    };

export async function requireAdminUserAccess(): Promise<AdminAccess> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
    };
  }

  if (session.role !== "admin") {
    return {
      session: null,
      error: NextResponse.json({ message: "Só Admin pode gerir utilizadores." }, { status: 403 })
    };
  }

  return { session, error: null };
}

export function missingAdminKeyResponse() {
  return NextResponse.json(
    {
      message:
        "Para gerir utilizadores, adiciona a variável SUPABASE_SERVICE_ROLE_KEY no Vercel e no ambiente local."
    },
    { status: 500 }
  );
}

export async function supabaseAdminRequest<T>(
  resource: string,
  method: string,
  body?: unknown,
  prefer: "return=representation" | "return=minimal" = "return=representation"
) {
  const headers = supabaseAdminHeaders();
  if (!headers) throw new Error("missing_admin_key");

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

export function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeRole(value: unknown) {
  return isRole(value) ? value : null;
}

export async function getManagedUser(username: string) {
  const rows = await supabaseAdminRequest<ManagedUser[]>(
    `app_users?username=eq.${encodeURIComponent(username)}&select=username,role,updated_at&limit=1`,
    "GET"
  );
  return rows[0] ?? null;
}

export async function countAdminUsers() {
  const rows = await supabaseAdminRequest<{ username: string }[]>("app_users?role=eq.admin&select=username", "GET");
  return rows.length;
}

export function safeUser(user: ManagedUser) {
  return {
    username: user.username,
    role: user.role,
    updated_at: user.updated_at ?? null
  };
}

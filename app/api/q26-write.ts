import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../auth";
import type { AuthSession } from "../auth-types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ushhacwtmpmwmvpaitdx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";

type JsonBody = Record<string, unknown>;

type PreparedPayload =
  | {
      payload: JsonBody;
      error: null;
    }
  | {
      payload: null;
      error: NextResponse;
    };

type WriteAccess =
  | {
      session: AuthSession;
      error: null;
    }
  | {
      session: null;
      error: NextResponse;
    };

export async function requireWriteAccess(): Promise<WriteAccess> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ message: "Sessão expirada. Entra novamente." }, { status: 401 })
    };
  }

  if (session.role === "view") {
    return {
      session: null,
      error: NextResponse.json({ message: "Sem permissão para gravar." }, { status: 403 })
    };
  }

  return { session, error: null };
}

export function requireDeleteAccess(session: AuthSession) {
  if (session.role !== "admin") {
    return NextResponse.json({ message: "Só Admin pode apagar registos." }, { status: 403 });
  }
  return null;
}

export async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as JsonBody;
  } catch {
    return {};
  }
}

export function prepareWritePayload(
  body: JsonBody,
  session: AuthSession,
  isEditing: boolean,
  auditTarget: "event" | "movement"
): PreparedPayload {
  const { justification, ...payload } = body;
  const justificationText = typeof justification === "string" ? justification.trim() : "";

  if (session.role === "operator" && isEditing && !justificationText) {
    return {
      payload: null,
      error: NextResponse.json({ message: "Indica a justificação da alteração." }, { status: 400 })
    };
  }

  if (session.role === "operator" && isEditing && auditTarget === "movement") {
    const raw = typeof payload.raw === "object" && payload.raw !== null && !Array.isArray(payload.raw) ? payload.raw : {};
    payload.raw = {
      ...raw,
      ultima_alteracao: {
        data: new Date().toISOString(),
        role: session.role,
        utilizador: session.username,
        justificacao: justificationText
      }
    };
  }

  return { payload, error: null };
}

export async function supabaseWrite(resource: string, method: string, body?: JsonBody) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`, {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const responseBody = await response.text();
    return NextResponse.json({ message: `${response.status} ${response.statusText}: ${responseBody}` }, { status: response.status });
  }

  const responseBody = await response.text();
  return NextResponse.json(responseBody ? JSON.parse(responseBody) : null);
}

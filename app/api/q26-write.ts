import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "../audit-log";
import { getSession } from "../auth";
import { canDelete, canWrite, requiresJustification, type AuthSession } from "../auth-types";

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

type AuditContext = {
  justificacao?: string;
};

type JsonRecord = Record<string, unknown>;

type EventLockState = {
  id: string;
  nome: string;
  fechado: boolean | null;
};

type EventLockResult =
  | {
      event: EventLockState;
      error: null;
    }
  | {
      event: null;
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

  if (!canWrite(session)) {
    return {
      session: null,
      error: NextResponse.json({ message: "Sem permissão para gravar." }, { status: 403 })
    };
  }

  return { session, error: null };
}

export async function requireSessionAccess(): Promise<WriteAccess> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ message: "Sessão expirada. Entra novamente." }, { status: 401 })
    };
  }

  return { session, error: null };
}

export function requireDeleteAccess(session: AuthSession) {
  if (!canDelete(session)) {
    return NextResponse.json({ message: "Sem permissão para apagar registos." }, { status: 403 });
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

async function supabaseReadRows<T>(resource: string) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const responseBody = await response.text();
    return {
      data: null,
      error: NextResponse.json({ message: `${response.status} ${response.statusText}: ${responseBody}` }, { status: response.status })
    };
  }

  return {
    data: (await response.json()) as T[],
    error: null
  };
}

export async function getEventLockState(eventId: string): Promise<EventLockResult> {
  const result = await supabaseReadRows<EventLockState>(
    `eventos?id=eq.${encodeURIComponent(eventId)}&select=id,nome,fechado&limit=1`
  );
  if (result.error) return { event: null, error: result.error };

  const event = result.data?.[0];
  if (!event) {
    return {
      event: null,
      error: NextResponse.json({ message: "Evento não encontrado." }, { status: 404 })
    };
  }

  return { event, error: null };
}

export async function getMovementEventLockState(movementId: string): Promise<EventLockResult> {
  const movementResult = await supabaseReadRows<{ evento_id: string | null }>(
    `movimentos?id=eq.${encodeURIComponent(movementId)}&select=evento_id&limit=1`
  );
  if (movementResult.error) return { event: null, error: movementResult.error };

  const eventId = movementResult.data?.[0]?.evento_id;
  if (!eventId) {
    return {
      event: null,
      error: NextResponse.json({ message: "Movimento não encontrado." }, { status: 404 })
    };
  }

  return getEventLockState(eventId);
}

export function eventLockedResponse(eventName: string) {
  return NextResponse.json(
    { message: `O evento "${eventName}" está fechado. Desbloqueia no Admin antes de alterar.` },
    { status: 423 }
  );
}

export function bodyHasClosedState(body: JsonBody) {
  return Object.prototype.hasOwnProperty.call(body, "fechado");
}

export function bodyOnlyUnlocksEvent(body: JsonBody) {
  const allowedKeys = new Set(["fechado", "justification"]);
  return body.fechado === false && Object.keys(body).every((key) => allowedKeys.has(key));
}

export function prepareWritePayload(
  body: JsonBody,
  session: AuthSession,
  isEditing: boolean,
  auditTarget: "event" | "movement" | "note"
): PreparedPayload {
  const { justification, ...payload } = body;
  const justificationText = typeof justification === "string" ? justification.trim() : "";

  const mustJustify = requiresJustification(session);
  if (mustJustify && isEditing && !justificationText) {
    return {
      payload: null,
      error: NextResponse.json({ message: "Indica a justificação da alteração." }, { status: 400 })
    };
  }

  if (mustJustify && isEditing && auditTarget === "movement") {
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

function baseResource(resource: string) {
  return resource.split("?")[0] ?? resource;
}

function resourceLabel(resource: string) {
  if (resource === "eventos") return "evento";
  if (resource === "movimentos") return "movimento";
  if (resource === "notas") return "nota";
  return resource;
}

function actionLabel(method: string, resource: string) {
  const label = resourceLabel(resource);
  if (method === "POST") return `Criou ${label}`;
  if (method === "PATCH") return `Alterou ${label}`;
  if (method === "DELETE") return `Apagou ${label}`;
  return `${method} ${label}`;
}

function getFilterId(resource: string) {
  const match = resource.match(/(?:^|[?&])id=eq\.([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function firstResponseRow(value: unknown) {
  if (Array.isArray(value)) return value[0] as JsonRecord | undefined;
  if (value && typeof value === "object") return value as JsonRecord;
  return undefined;
}

function auditSummary(action: string, body: JsonBody | undefined, response: unknown) {
  const row = firstResponseRow(response);
  const name = row?.nome ?? row?.item ?? row?.titulo ?? body?.nome ?? body?.item ?? body?.titulo;
  return typeof name === "string" && name.trim() ? `${action}: ${name}` : action;
}

export async function supabaseWrite(
  resource: string,
  method: string,
  body?: JsonBody,
  session?: AuthSession,
  auditContext?: AuditContext
) {
  const resourceName = baseResource(resource);
  const filteredResourceId = getFilterId(resource);
  let beforeSnapshot: JsonRecord | null = null;

  if (resourceName === "movimentos" && filteredResourceId && (method === "PATCH" || method === "DELETE")) {
    const beforeResult = await supabaseReadRows<JsonRecord>(
      `movimentos?id=eq.${encodeURIComponent(filteredResourceId)}&select=*&limit=1`
    );
    if (!beforeResult.error) {
      beforeSnapshot = beforeResult.data?.[0] ?? null;
    }
  }

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
  const parsedResponse = responseBody ? JSON.parse(responseBody) : null;

  if (session) {
    const row = firstResponseRow(parsedResponse);
    const resourceId = typeof row?.id === "string" ? row.id : filteredResourceId;
    const action = actionLabel(method, resourceName);
    await writeAuditLog({
      session,
      action,
      resource: resourceName,
      resourceId,
      summary: auditSummary(action, body, parsedResponse),
      details: {
        method,
        payload: body ?? null,
        resource,
        ...(resourceName === "movimentos"
          ? {
              before: beforeSnapshot,
              after: row ?? null
            }
          : {}),
        ...auditContext
      }
    });
  }

  return NextResponse.json(parsedResponse);
}

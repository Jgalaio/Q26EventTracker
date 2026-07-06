import type { AuthSession } from "./auth-types";

export type AuditLogEntry = {
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

type AuditLogInput = {
  session: AuthSession;
  action: string;
  resource: string;
  resourceId?: string | null;
  summary?: string | null;
  details?: Record<string, unknown>;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ushhacwtmpmwmvpaitdx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";

function endpoint(resource: string) {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`;
}

export async function writeAuditLog({ session, action, resource, resourceId = null, summary = null, details = {} }: AuditLogInput) {
  try {
    await fetch(endpoint("app_audit_logs"), {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: session.username,
        role: session.role,
        action,
        resource,
        resource_id: resourceId,
        summary,
        details
      })
    });
  } catch {
    // Audit logging must not block the main operation if the log table is not ready yet.
  }
}

export async function getAuditLogs(page: number, pageSize = 50) {
  const safePage = Math.max(0, Number.isFinite(page) ? page : 0);
  const safePageSize = Math.max(1, pageSize);
  const offset = safePage * safePageSize;

  try {
    const response = await fetch(
      `${endpoint("app_audit_logs")}?select=*&order=created_at.desc&limit=${safePageSize + 1}&offset=${offset}`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return {
        error: await response.text(),
        hasNext: false,
        logs: [] as AuditLogEntry[]
      };
    }

    const rows = (await response.json()) as AuditLogEntry[];
    return {
      error: null,
      hasNext: rows.length > safePageSize,
      logs: rows.slice(0, safePageSize)
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível carregar o log.",
      hasNext: false,
      logs: [] as AuditLogEntry[]
    };
  }
}

export async function getMovementAuditLogs(movementId: string, limit = 50) {
  const safeLimit = Math.max(1, Math.min(100, limit));

  try {
    const response = await fetch(
      `${endpoint("app_audit_logs")}?select=*&resource=eq.movimentos&resource_id=eq.${encodeURIComponent(
        movementId
      )}&order=created_at.desc&limit=${safeLimit}`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return {
        error: await response.text(),
        logs: [] as AuditLogEntry[]
      };
    }

    return {
      error: null,
      logs: (await response.json()) as AuditLogEntry[]
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível carregar o histórico.",
      logs: [] as AuditLogEntry[]
    };
  }
}

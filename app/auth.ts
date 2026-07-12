import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { roleIdIsSafe, sessionFromRole, type AuthSession, type UserRole } from "./auth-types";
import { enrichSession } from "./role-settings";

export const AUTH_COOKIE_NAME = "q26_session";

type AuthUser = {
  username: string;
  role: UserRole;
  passwordHash: string;
};

type SupabaseLoginRow = {
  username: string | null;
  role: string | null;
  password_valid: boolean;
  has_override: boolean;
};

type SupabaseUserRow = {
  username: string | null;
  role: string | null;
  updated_at?: string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ushhacwtmpmwmvpaitdx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const AUTH_USERS: AuthUser[] = [
  {
    username: "J.Galaio",
    role: "admin",
    passwordHash: "325cb2800043914c9e9d09f6006aff8c90b55eeb4928d13aa4a3385003bcea26"
  },
  {
    username: "A.Lopes",
    role: "admin",
    passwordHash: "b5b1ad0508150fece4e94ce08996eef647319ded8abb712c8c6b63c51f745825"
  },
  {
    username: "M.Amendoeira",
    role: "operator",
    passwordHash: "b78ecebe0a0c3e78c06b12ff45018eef3cab88c0119531d72d4b362c612b9303"
  },
  {
    username: "Q26",
    role: "view",
    passwordHash: "a6c71bf69ece63be7e9fec6791203c7a1d444a8b32303bc1147b326772b62993"
  }
];

function authSecret() {
  return process.env.Q26_AUTH_SECRET || "q26-event-tracker-change-this-secret";
}

export function hashCredential(username: string, password: string) {
  return createHash("sha256").update(`${username}:${password}`).digest("hex");
}

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function encodeBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

export function isRole(value: unknown): value is UserRole {
  return roleIdIsSafe(value);
}

export function supabaseEndpoint(resource: string) {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`;
}

export function supabaseAdminHeaders() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}

async function verifyStoredCredentials(username: string, password: string) {
  const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/app_verify_login`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_username: username, p_password: password }),
      cache: "no-store"
    });

    if (!response.ok) return null;
    const rows = (await response.json()) as SupabaseLoginRow[];
    const row = rows[0];
    if (!row?.has_override) return { hasOverride: false, session: null };
    if (!row.password_valid || typeof row.username !== "string" || !isRole(row.role)) {
      return { hasOverride: true, session: null };
    }

    return {
      hasOverride: true,
      session: await enrichSession({
        username: row.username,
        role: row.role
      })
    };
  } catch {
    return null;
  }
}

export async function listAuthUsers() {
  const adminHeaders = supabaseAdminHeaders();
  if (adminHeaders) {
    try {
      const response = await fetch(supabaseEndpoint("app_users?select=username,role,updated_at&order=username.asc"), {
        headers: adminHeaders,
        cache: "no-store"
      });

      if (response.ok) {
        const rows = (await response.json()) as SupabaseUserRow[];
        return rows
          .filter((row): row is SupabaseUserRow & { username: string; role: UserRole } => {
            return typeof row.username === "string" && isRole(row.role);
          })
          .map((row) => ({ username: row.username, role: row.role, updated_at: row.updated_at ?? null }));
      }
    } catch {
      // Keep the built-in users as a fallback when Supabase admin access is not available.
    }
  }

  return AUTH_USERS.map(({ username, role }) => ({ username, role, updated_at: null }));
}

export async function verifyCredentials(username: string, password: string): Promise<AuthSession | null> {
  const normalizedUsername = username.trim();
  const storedCredentials = await verifyStoredCredentials(normalizedUsername, password);
  if (storedCredentials?.hasOverride) return storedCredentials.session;

  const user = AUTH_USERS.find((candidate) => candidate.username === normalizedUsername);
  if (!user) return null;

  const passwordHash = hashCredential(normalizedUsername, password);
  if (!safeCompare(passwordHash, user.passwordHash)) return null;

  return enrichSession({
    username: user.username,
    role: user.role
  });
}

export function createSessionToken(session: AuthSession) {
  const payload = encodeBase64Url(
    JSON.stringify({
      username: session.username,
      role: session.role,
      iat: Date.now()
    })
  );
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function readSessionFromToken(token: string | undefined): AuthSession | null {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || signPayload(payload) !== signature) return null;

  try {
    const decoded = JSON.parse(decodeBase64Url(payload)) as Record<string, unknown>;
    if (typeof decoded.username !== "string" || !isRole(decoded.role)) return null;
    return sessionFromRole(
      decoded.username,
      decoded.role
    );
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = readSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  return session ? enrichSession(session) : null;
}

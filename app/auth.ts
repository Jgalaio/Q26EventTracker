import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { AuthSession, UserRole } from "./auth-types";

export const AUTH_COOKIE_NAME = "q26_session";

type AuthUser = AuthSession & {
  passwordHash: string;
};

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

function hashCredential(username: string, password: string) {
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

function isRole(value: unknown): value is UserRole {
  return value === "admin" || value === "operator" || value === "view";
}

export function listAuthUsers() {
  return AUTH_USERS.map(({ username, role }) => ({ username, role }));
}

export function verifyCredentials(username: string, password: string): AuthSession | null {
  const normalizedUsername = username.trim();
  const user = AUTH_USERS.find((candidate) => candidate.username === normalizedUsername);
  if (!user) return null;

  const passwordHash = hashCredential(normalizedUsername, password);
  if (!safeCompare(passwordHash, user.passwordHash)) return null;

  return {
    username: user.username,
    role: user.role
  };
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
    return {
      username: decoded.username,
      role: decoded.role
    };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  return readSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
}

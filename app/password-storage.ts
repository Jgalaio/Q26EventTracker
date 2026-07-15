import { hashCredential, supabaseAdminHeaders, supabaseEndpoint } from "./auth";
import type { UserRole } from "./auth-types";

type SavePasswordResult =
  | { ok: true }
  | {
      message: string;
      ok: false;
      status: number;
    };

async function responseError(response: Response) {
  const detail = await response.text().catch(() => "");
  return detail ? ` ${detail}` : "";
}

export async function saveUserPassword(username: string, role: UserRole, newPassword: string): Promise<SavePasswordResult> {
  const adminHeaders = supabaseAdminHeaders();
  if (!adminHeaders) {
    return {
      ok: false,
      status: 500,
      message: "Para alterar passwords, define a SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor."
    };
  }

  const updatedAt = new Date().toISOString();
  const payload = {
    password_hash: hashCredential(username, newPassword),
    updated_at: updatedAt
  };

  const lookupResponse = await fetch(
    supabaseEndpoint(`app_users?username=eq.${encodeURIComponent(username)}&select=username&limit=1`),
    {
      headers: adminHeaders,
      cache: "no-store"
    }
  );

  if (!lookupResponse.ok) {
    return {
      ok: false,
      status: 500,
      message: `Não consegui consultar o utilizador no Supabase.${await responseError(lookupResponse)}`
    };
  }

  const existingRows = (await lookupResponse.json().catch(() => [])) as Array<{ username?: string | null }>;
  if (existingRows.some((row) => row.username === username)) {
    const updateResponse = await fetch(supabaseEndpoint(`app_users?username=eq.${encodeURIComponent(username)}`), {
      method: "PATCH",
      headers: {
        ...adminHeaders,
        Prefer: "return=minimal"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    if (!updateResponse.ok) {
      return {
        ok: false,
        status: 500,
        message: `Não consegui guardar a password no Supabase.${await responseError(updateResponse)}`
      };
    }

    return { ok: true };
  }

  const createResponse = await fetch(supabaseEndpoint("app_users"), {
    method: "POST",
    headers: {
      ...adminHeaders,
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      ...payload,
      role,
      username
    }),
    cache: "no-store"
  });

  if (!createResponse.ok) {
    return {
      ok: false,
      status: 500,
      message: `Não consegui criar o registo de password no Supabase.${await responseError(createResponse)}`
    };
  }

  return { ok: true };
}

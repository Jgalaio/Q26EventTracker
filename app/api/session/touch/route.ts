import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken, getSession } from "../../../auth";

export async function POST() {
  const session = await getSession();

  if (!session) {
    const response = NextResponse.json({ message: "Sessão expirada." }, { status: 401 });
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, createSessionToken(session), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken, verifyCredentials } from "../../auth";

function safeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const session = verifyCredentials(username, password);
  const nextPath = safeNextPath(formData.get("next"));

  if (!session) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url, 303);
  }

  const target = session.role === "view" ? "/overview" : nextPath;
  const response = NextResponse.redirect(new URL(target, request.url), 303);
  response.cookies.set(AUTH_COOKIE_NAME, createSessionToken(session), {
    httpOnly: true,
    maxAge: 60 * 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}

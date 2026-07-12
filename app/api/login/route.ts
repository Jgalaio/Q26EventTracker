import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken, verifyCredentials } from "../../auth";
import { isViewOnly } from "../../auth-types";

function safeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const session = await verifyCredentials(username, password);
  const nextPath = safeNextPath(formData.get("next"));

  if (!session) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url, 303);
  }

  const redirectPath = isViewOnly(session) ? "/overview" : nextPath;
  const response = NextResponse.redirect(new URL(redirectPath, request.url), 303);
  response.cookies.set(AUTH_COOKIE_NAME, createSessionToken(session), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}

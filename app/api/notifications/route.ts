import { NextResponse } from "next/server";
import { getSession } from "../../auth";
import { getInternalNotifications } from "../../internal-notifications";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 });

  return NextResponse.json(await getInternalNotifications(session));
}

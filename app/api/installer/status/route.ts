import { NextResponse } from "next/server";
import { getInstallerStatus } from "../../../installer";

export async function GET() {
  return NextResponse.json({ status: await getInstallerStatus() });
}

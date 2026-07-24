import { getInstallerSql } from "../../../installer";

export async function GET() {
  return new Response(await getInstallerSql(), {
    headers: {
      "Content-Disposition": 'attachment; filename="q26-first-run-schema.sql"',
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}

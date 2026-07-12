import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getSession } from "../auth";
import { canViewTreasury } from "../auth-types";
import { getNotas, getTesourariaData } from "../supabase-data";
import { GlobalSearchClient } from "./global-search-client";

export default async function GlobalSearchPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/pesquisa");
  if (!canViewTreasury(session)) redirect("/overview");

  const [{ eventos, movimentos, error }, notes, appLogo] = await Promise.all([
    getTesourariaData(),
    getNotas(300),
    getAppLogo()
  ]);

  return (
    <GlobalSearchClient
      appLogo={appLogo}
      error={error ?? notes.error}
      eventos={eventos}
      movimentos={movimentos}
      notas={notes.data}
      session={session}
    />
  );
}

import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getSession } from "../auth";
import { canViewDocuments, canViewTreasury } from "../auth-types";
import { getArchivedDocumentSummaries } from "../document-archive";
import { getNotas, getTesourariaData } from "../supabase-data";
import { GlobalSearchClient } from "./global-search-client";

export default async function GlobalSearchPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/pesquisa");
  if (!canViewTreasury(session)) redirect("/overview");

  const mayViewDocuments = canViewDocuments(session);
  const [{ eventos, movimentos, error }, notes, appLogo, documents] = await Promise.all([
    getTesourariaData(),
    getNotas(300),
    getAppLogo(),
    mayViewDocuments ? getArchivedDocumentSummaries(session) : Promise.resolve([])
  ]);

  return (
    <GlobalSearchClient
      appLogo={appLogo}
      error={error ?? notes.error}
      eventos={eventos}
      movimentos={movimentos}
      notas={notes.data}
      documents={documents}
      session={session}
    />
  );
}

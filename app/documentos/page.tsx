import { redirect } from "next/navigation";
import { getAppLogo } from "../app-settings";
import { getSession } from "../auth";
import { canViewDocuments, isViewOnly } from "../auth-types";
import { getArchivedDocumentSummaries } from "../document-archive";
import { getEventSummaries } from "../supabase-data";
import { TopbarActions } from "../topbar-actions";
import { TopbarBrand } from "../topbar-brand";
import { DocumentArchiveClient } from "./document-archive-client";

export default async function DocumentArchivePage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/documentos");
  if (isViewOnly(session)) redirect("/overview");
  if (!canViewDocuments(session)) redirect("/");

  const [appLogo, documents, tesourariaData] = await Promise.all([
    getAppLogo(),
    getArchivedDocumentSummaries(session),
    getEventSummaries()
  ]);
  const events = tesourariaData.data.filter((event) => event.slug !== "contas");

  return (
    <main className="shell document-shell">
      <section className="topbar">
        <TopbarBrand logo={appLogo} title="Documentos" />
        <TopbarActions active="documentos" session={session} />
      </section>

      <DocumentArchiveClient events={events} initialDocuments={documents} session={session} />
    </main>
  );
}

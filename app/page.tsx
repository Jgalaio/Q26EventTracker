import { redirect } from "next/navigation";
import { getSession } from "./auth";
import { Dashboard } from "./tesouraria-dashboard";
import { getTesourariaData } from "./supabase-data";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login?next=/");
  if (session.role === "view") redirect("/overview");

  const { eventos, movimentos, error } = await getTesourariaData();

  return <Dashboard eventos={eventos} movimentos={movimentos} error={error} session={session} />;
}

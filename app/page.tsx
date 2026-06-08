import { redirect } from "next/navigation";
import { getQ25Balance } from "./app-settings";
import { getSession } from "./auth";
import { Dashboard } from "./tesouraria-dashboard";
import { getTesourariaData } from "./supabase-data";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login?next=/");
  if (session.role === "view") redirect("/overview");

  const [{ eventos, movimentos, error }, q25Balance] = await Promise.all([getTesourariaData(), getQ25Balance()]);

  return <Dashboard eventos={eventos} movimentos={movimentos} error={error} q25Balance={q25Balance} session={session} />;
}

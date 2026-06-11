import { redirect } from "next/navigation";
import { getAppLogo, getQ25Balance } from "./app-settings";
import { getSession } from "./auth";
import { Dashboard } from "./tesouraria-dashboard";
import { getTesourariaData } from "./supabase-data";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login?next=/");
  if (session.role === "view") redirect("/overview");

  const [{ eventos, movimentos, error }, q25Balance, appLogo] = await Promise.all([
    getTesourariaData(),
    getQ25Balance(),
    getAppLogo()
  ]);

  return (
    <Dashboard
      appLogo={appLogo}
      error={error}
      eventos={eventos}
      movimentos={movimentos}
      q25Balance={q25Balance}
      session={session}
    />
  );
}

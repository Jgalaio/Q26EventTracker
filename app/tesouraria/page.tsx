import { redirect } from "next/navigation";
import { getAppLogo, getPhysicalCashSettings, getQ25Settings } from "../app-settings";
import { getSession } from "../auth";
import { canViewTreasury } from "../auth-types";
import { getTesourariaData } from "../supabase-data";
import { Dashboard } from "../tesouraria-dashboard";

export default async function TesourariaPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/tesouraria");
  if (!canViewTreasury(session)) redirect("/overview");

  const [{ eventos, movimentos, error }, q25Settings, physicalCashSettings, appLogo] = await Promise.all([
    getTesourariaData(),
    getQ25Settings(),
    getPhysicalCashSettings(),
    getAppLogo()
  ]);

  return (
    <Dashboard
      appLogo={appLogo}
      error={error}
      eventos={eventos}
      movimentos={movimentos}
      physicalCashCount={physicalCashSettings.amount}
      q25Balance={q25Settings.amount}
      showQ25ProfitCard={q25Settings.showProfitCard}
      session={session}
    />
  );
}

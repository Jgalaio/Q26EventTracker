import { Dashboard } from "./tesouraria-dashboard";
import { getTesourariaData } from "./supabase-data";

export default async function Home() {
  const { eventos, movimentos, error } = await getTesourariaData();

  return <Dashboard eventos={eventos} movimentos={movimentos} error={error} />;
}

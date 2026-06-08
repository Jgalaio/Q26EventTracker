export type ReportLogo = {
  dataUrl: string;
  fileName: string | null;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ushhacwtmpmwmvpaitdx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB";

type AppSettingRow = {
  key: string;
  value: unknown;
};

function endpoint(resource: string) {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${resource}`;
}

export async function readAppSetting<T>(key: string): Promise<T | null> {
  try {
    const response = await fetch(`${endpoint("app_settings")}?key=eq.${encodeURIComponent(key)}&select=key,value`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) return null;
    const rows = (await response.json()) as AppSettingRow[];
    return (rows[0]?.value as T | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function writeAppSetting(key: string, value: unknown) {
  const response = await fetch(`${endpoint("app_settings")}?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({ key, value })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function deleteAppSetting(key: string) {
  const response = await fetch(`${endpoint("app_settings")}?key=eq.${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function getReportLogo() {
  const logo = await readAppSetting<ReportLogo>("report_logo");
  return logo?.dataUrl ? logo : null;
}

import { db } from "../db.js";

export type AppSettings = {
  requireVerifiedToQuote: boolean;
  maintenanceMode: boolean;
};

const DEFAULTS: AppSettings = {
  requireVerifiedToQuote: false,
  maintenanceMode: false,
};

export async function getAppSettings(): Promise<AppSettings> {
  const { data, error } = await db.from("app_settings").select("key, value");
  if (error || !data?.length) return { ...DEFAULTS };

  const map = Object.fromEntries(data.map((r) => [r.key, r.value]));
  return {
    requireVerifiedToQuote: map.require_verified_to_quote === true,
    maintenanceMode: map.maintenance_mode === true,
  };
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const rows: { key: string; value: boolean }[] = [];
  if (patch.requireVerifiedToQuote !== undefined) {
    rows.push({ key: "require_verified_to_quote", value: patch.requireVerifiedToQuote });
  }
  if (patch.maintenanceMode !== undefined) {
    rows.push({ key: "maintenance_mode", value: patch.maintenanceMode });
  }

  for (const row of rows) {
    await db
      .from("app_settings")
      .upsert({ key: row.key, value: row.value, updated_at: new Date().toISOString() });
  }

  return getAppSettings();
}

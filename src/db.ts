import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export const db = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: "user" | "technician";
  avatar_url: string | null;
  password_hash: string | null;
  email_verified: boolean;
  phone: string | null;
  created_at: string;
};

export type JobRow = {
  id: string;
  user_id: string;
  job_number: string;
  category: string;
  title: string;
  description: string;
  photos: string[];
  lokasi_type: string;
  area: string;
  alamat: string | null;
  waktu_type: string;
  tanggal: string | null;
  budget_type: string;
  budget_raw: number | null;
  status: string;
  urgency: string | null;
  assigned_technician_id: string | null;
  latitude: number | null;
  longitude: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

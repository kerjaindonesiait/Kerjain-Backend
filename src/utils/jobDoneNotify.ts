import { db } from "../db.js";
import { sendJobMarkedDoneByTechnicianEmail } from "./notifyEmails.js";

export async function notifyPosterJobMarkedDone(jobId: string, technicianId: string) {
  const { data: job } = await db.from("jobs").select("title, user_id").eq("id", jobId).single();
  if (!job?.user_id) return;

  const [{ data: owner }, { data: tech }] = await Promise.all([
    db.from("users").select("email, full_name").eq("id", job.user_id).single(),
    db.from("users").select("full_name, email").eq("id", technicianId).single(),
  ]);

  if (!owner?.email) return;

  await sendJobMarkedDoneByTechnicianEmail(
    owner.email,
    owner.full_name,
    job.title,
    tech?.full_name ?? tech?.email ?? "Tukang",
  );
}

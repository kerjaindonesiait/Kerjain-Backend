const VALID_LAYANAN = new Set([
  "darurat", "deteksi", "mampet", "water", "pipa", "bathroom",
  "maintenance", "handyman", "pintu", "talang", "keramik", "atap",
]);

export function validateCreateJobBody(body: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};

  const layanan = String(body.layanan ?? body.category ?? "");
  if (!layanan || !VALID_LAYANAN.has(layanan)) {
    errors.layanan = "Pilih kategori layanan";
  }

  const deskripsi = String(body.deskripsi ?? body.description ?? "").trim();
  if (deskripsi.length < 30) {
    errors.deskripsi = "Deskripsi minimal 30 karakter";
  }

  const area = String(body.area ?? "").trim();
  if (!area) {
    errors.area = "Pilih area lokasi";
  }

  const waktuType = String(body.waktuType ?? "");
  if (!waktuType) {
    errors.waktuType = "Pilih kapan pekerjaan dibutuhkan";
  }

  if (waktuType === "sebelum" && !String(body.tanggal ?? "").trim()) {
    errors.tanggal = "Pilih tanggal batas";
  }

  const budgetType = String(body.budgetType ?? "tetap");
  if (budgetType === "tetap") {
    const budget = String(body.budget ?? "").replace(/\D/g, "");
    if (!budget || parseInt(budget, 10) < 10000) {
      errors.budget = "Masukkan anggaran minimal Rp 10.000";
    }
  }

  const photos = body.photos;
  if (photos !== undefined && !Array.isArray(photos)) {
    errors.photos = "Format foto tidak valid";
  } else if (Array.isArray(photos) && photos.length > 3) {
    errors.photos = "Maksimal 3 foto";
  }

  return errors;
}

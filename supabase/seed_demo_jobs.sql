-- =============================================================================
-- KerjaIn — Demo seed: clear all jobs + fake poster users + sample listings
-- Run in Supabase Dashboard → SQL Editor (service role / postgres)
--
-- Demo poster logins (optional): email demo.*@kerjain.demo, password: password
-- Does NOT delete real user accounts — only jobs + demo.*@kerjain.demo users
-- =============================================================================

BEGIN;

-- ─── 1. Clear job-related data (order matters for FKs) ─────────────────────

DELETE FROM payments;
DELETE FROM offers;
DELETE FROM messages;
DELETE FROM reviews;
DELETE FROM jobs;

-- Remove demo poster accounts from a previous seed run
DELETE FROM users WHERE email LIKE 'demo.%@kerjain.demo';

-- ─── 2. Fake poster users (role = user / pemilik pekerjaan) ────────────────
-- bcrypt hash below = password "password" (display-only; login optional)

INSERT INTO users (id, email, password_hash, full_name, role, email_verified, phone, created_at)
VALUES
  ('a1000001-0001-4001-8001-000000000001', 'demo.rina@kerjain.demo',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Rina Kartika',    'user', true, '6281234567001', now() - interval '45 days'),
  ('a1000001-0001-4001-8001-000000000002', 'demo.dewi@kerjain.demo',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Dewi Maharani',   'user', true, '6281234567002', now() - interval '30 days'),
  ('a1000001-0001-4001-8001-000000000003', 'demo.tono@kerjain.demo',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Tono Wijaya',     'user', true, '6281234567003', now() - interval '60 days'),
  ('a1000001-0001-4001-8001-000000000004', 'demo.hana@kerjain.demo',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Hana Surya',      'user', true, '6281234567004', now() - interval '20 days'),
  ('a1000001-0001-4001-8001-000000000005', 'demo.budi@kerjain.demo',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Budi Santoso',    'user', true, '6281234567005', now() - interval '90 days'),
  ('a1000001-0001-4001-8001-000000000006', 'demo.siti@kerjain.demo',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Siti Aminah',     'user', true, '6281234567006', now() - interval '15 days');

-- ─── 3. Fake jobs (open listings for client demo) ───────────────────────────

INSERT INTO jobs (
  id, user_id, job_number, category, title, description, photos,
  lokasi_type, area, alamat, latitude, longitude,
  waktu_type, tanggal, budget_type, budget_raw, urgency, status,
  assigned_technician_id, created_at, updated_at
) VALUES

-- 1 · Darurat · Jakarta Selatan
(
  'b2000001-0001-4001-8001-000000000001',
  'a1000001-0001-4001-8001-000000000001',
  '#KJ-2026-10482',
  'darurat',
  'Pipa pecah di bawah wastafel dapur — butuh perbaikan segera',
  'Pipa PVC di bawah wastafel dapur retak dan air mengalir terus. Sudah menutup kran utama. Butuh tukang ledeng hari ini untuk perbaikan darurat.

• Lantai lemari basah
• Perlu inspeksi pipa sekitar wastafel
• Apartemen lantai 3, ada lift & parkir',
  '{}',
  'lokasi', 'Jakarta Selatan', 'Jl. Melawai Raya No. 12, Blok M', -6.2445, 106.7992,
  'asap', NULL, 'tetap', 500000, 'Segera', 'open', NULL,
  now() - interval '2 hours', now() - interval '2 hours'
),

-- 2 · Mampet · Tangerang Selatan
(
  'b2000001-0001-4001-8001-000000000002',
  'a1000001-0001-4001-8001-000000000003',
  '#KJ-2026-10483',
  'mampet',
  'Saluran shower kamar mandi utama hampir tidak mengalir',
  'Shower kamar mandi utama sudah sangat mampet sekitar seminggu. Sudah coba cairan pembersih saluran dua kali tanpa hasil.

Cari tukang dengan drain snake atau hydro-jet. Bisa datang Sabtu pagi. Rumah tinggal, akses mudah dari gerbang depan.',
  '{}',
  'lokasi', 'Tangerang Selatan', 'Jl. BSD Raya Utama, Sektor 14', -6.3012, 106.6845,
  'sebelum', '2026-07-05', 'tetap', 200000, 'Normal', 'open', NULL,
  now() - interval '5 hours', now() - interval '5 hours'
),

-- 3 · Water heater · Bekasi
(
  'b2000001-0001-4001-8001-000000000003',
  'a1000001-0001-4001-8001-000000000004',
  '#KJ-2026-10484',
  'water',
  'Water heater listrik tidak menghasilkan air panas',
  'Water heater Ariston 50L berumur ~8 tahun tiba-tiba tidak panas lagi. Lampu indikator menyala normal.

Perlu diagnosa — mungkin elemen pemanas atau termostat. Siap ganti part jika diperlukan.',
  '{}',
  'lokasi', 'Bekasi', 'Perumahan Harapan Indah, Blok AA2 No. 7', -6.2418, 106.9923,
  'sebelum', '2026-07-03', 'tetap', 350000, 'Normal', 'open', NULL,
  now() - interval '1 day', now() - interval '1 day'
),

-- 4 · Handyman · Jakarta Pusat
(
  'b2000001-0001-4001-8001-000000000004',
  'a1000001-0001-4001-8001-000000000005',
  '#KJ-2026-10485',
  'handyman',
  'Pasang rak dinding & curtain rod di ruang tamu',
  'Butuh tukang untuk:
• Pasang 2 rak dinding (bahan & bracket sudah ada)
• Pasang curtain rod 3 meter di jendela ruang tamu
• Bor ke dinding beton — perlu bor beton

Waktu fleksibel akhir pekan.',
  '{}',
  'lokasi', 'Jakarta Pusat', 'Menteng, Jl. Surabaya No. 45', -6.1944, 106.8369,
  'fleksibel', NULL, 'tetap', 250000, 'Fleksibel', 'open', NULL,
  now() - interval '8 hours', now() - interval '8 hours'
),

-- 5 · Pintu · Depok
(
  'b2000001-0001-4001-8001-000000000005',
  'a1000001-0001-4001-8001-000000000002',
  '#KJ-2026-10486',
  'pintu',
  'Pintu kamar macet — engsel bawah longgar',
  'Pintu kamar tidur susah ditutup rapat dan menggeser sendiri. Engsel bawah sudah longgar. Perlu perbaikan atau ganti engsel.

Rumah 2 lantai, bisa parkir di carport.',
  '{}',
  'lokasi', 'Depok', 'Jl. Margonda Raya, Cinere', -6.3912, 106.7821,
  'fleksibel', NULL, 'tetap', 175000, 'Fleksibel', 'open', NULL,
  now() - interval '12 hours', now() - interval '12 hours'
),

-- 6 · Bathroom · Jakarta Barat
(
  'b2000001-0001-4001-8001-000000000006',
  'a1000001-0001-4001-8001-000000000006',
  '#KJ-2026-10487',
  'bathroom',
  'Ganti kran wastafel & selang fleksibel yang bocor',
  'Kran wastafel kamar mandi tamu menetes terus. Selang fleksibel di bawah wastafel sudah berkarat dan mulai bocor.

Mohon bawa kran standar jika perlu ganti — ukuran standar rumah.',
  '{}',
  'lokasi', 'Jakarta Barat', 'Kebon Jeruk, Jl. Anggrek Lestari', -6.1789, 106.7654,
  'asap', NULL, 'tetap', 150000, 'Segera', 'open', NULL,
  now() - interval '3 hours', now() - interval '3 hours'
),

-- 7 · Deteksi · Jakarta Timur
(
  'b2000001-0001-4001-8001-000000000007',
  'a1000001-0001-4001-8001-000000000001',
  '#KJ-2026-10488',
  'deteksi',
  'Dinding kamar mandi lembab — curiga pipa bocor tersembunyi',
  'Dinding sebelah shower terasa lembab dan cat mulai mengelupas. Tidak ada tetesan terlihat tapi bau lembap.

Butuh deteksi kebocoran (bisa dengan alat) dan estimasi perbaikan.',
  '{}',
  'lokasi', 'Jakarta Timur', 'Cipayung, Jl. Raya Bogor KM 22', -6.3089, 106.8912,
  'sebelum', '2026-07-08', 'tetap', 400000, 'Normal', 'open', NULL,
  now() - interval '2 days', now() - interval '2 days'
),

-- 8 · Pipa · Bogor
(
  'b2000001-0001-4001-8001-000000000008',
  'a1000001-0001-4001-8001-000000000003',
  '#KJ-2026-10489',
  'pipa',
  'Ganti pipa PVC menuju bak cuci piring yang sudah retak',
  'Pipa pembuangan di bawah bak cuci retak dan kadang bocor saat air banyak. Perlu ganti pipa PVC sekitar 2 meter.

Material bisa dibawa tukang atau reimburse — diskusi di chat.',
  '{}',
  'lokasi', 'Bogor', 'Jl. Pajajaran, Baranangsiang', -6.6012, 106.8089,
  'fleksibel', NULL, 'tetap', 300000, 'Fleksibel', 'open', NULL,
  now() - interval '18 hours', now() - interval '18 hours'
),

-- 9 · Minta penawaran · Jakarta Utara
(
  'b2000001-0001-4001-8001-000000000009',
  'a1000001-0001-4001-8001-000000000005',
  '#KJ-2026-10490',
  'maintenance',
  'Perawatan pipa & kran seluruh rumah (3 kamar mandi)',
  'Rumah 2 lantai, 3 kamar mandi. Ingin cek semua kran, shower, dan saluran wastafel sebelum musim hujan.

Belum punya anggaran pasti — mohon penawaran setelah survey singkat.',
  '{}',
  'lokasi', 'Jakarta Utara', 'Kelapa Gading, Jl. Boulevard Raya', -6.1578, 106.9056,
  'fleksibel', NULL, 'minta', NULL, 'Fleksibel', 'open', NULL,
  now() - interval '6 hours', now() - interval '6 hours'
),

-- 10 · Keramik · Tangerang
(
  'b2000001-0001-4001-8001-000000000010',
  'a1000001-0001-4001-8001-000000000002',
  '#KJ-2026-10491',
  'keramik',
  'Perbaikan keramik lantai dapur yang retak & copot',
  'Beberapa keping keramik lantai dapur retak dan satu sudah copot. Ukuran keramik 40x40 cm, warna abu-abu.

Perlu tempel ulang dan ganti keping yang rusak. Sisa keramik cadangan ada 3 keping.',
  '{}',
  'lokasi', 'Tangerang', 'Alam Sutera, Cluster Anggrek', -6.2234, 106.6512,
  'sebelum', '2026-07-10', 'tetap', 450000, 'Normal', 'open', NULL,
  now() - interval '1 day 4 hours', now() - interval '1 day 4 hours'
),

-- 11 · Atap · Jakarta Selatan
(
  'b2000001-0001-4001-8001-000000000011',
  'a1000001-0001-4001-8001-000000000004',
  '#KJ-2026-10492',
  'atap',
  'Atap bocor di sudut ruang tamu saat hujan deras',
  'Setiap hujan deras ada rembesan di plafon sudut ruang tamu. Kemungkinan dari sambungan genteng atau flashing.

Butuh inspeksi atap dan perbaikan titik bocor. Rumah 1 lantai, akses tangga tersedia.',
  '{}',
  'lokasi', 'Jakarta Selatan', 'Cilandak, Jl. Cilandak KKO', -6.2891, 106.8012,
  'sebelum', '2026-07-06', 'tetap', 600000, 'Normal', 'open', NULL,
  now() - interval '3 days', now() - interval '3 days'
),

-- 12 · Talang · Jakarta Timur
(
  'b2000001-0001-4001-8001-000000000012',
  'a1000001-0001-4001-8001-000000000006',
  '#KJ-2026-10493',
  'talang',
  'Bersihkan talang air & pipa turun yang mampet',
  'Talang air depan dan belakang penuh daun kering. Saat hujan air meluap ke dinding.

Perlu bersihkan talang + pipa turun, cek kemiringan. Rumah 2 lantai, perlu tangga tinggi.',
  '{}',
  'lokasi', 'Jakarta Timur', 'Duren Sawit, Jl. Radin Inten II', -6.2234, 106.9234,
  'fleksibel', NULL, 'tetap', 275000, 'Fleksibel', 'open', NULL,
  now() - interval '4 hours', now() - interval '4 hours'
);

COMMIT;

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- SELECT count(*) AS jobs FROM jobs;
-- SELECT job_number, title, area, status FROM jobs ORDER BY created_at DESC;

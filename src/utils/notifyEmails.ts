import { config } from "../config.js";
import { sendAuthEmail } from "./email.js";

export async function sendNewOfferEmail(
  ownerEmail: string,
  ownerName: string | null,
  jobTitle: string,
  technicianName: string,
  price: number,
) {
  const priceFmt = `Rp ${price.toLocaleString("id-ID")}`;
  const url = `${config.frontendUrl}/pekerjaan-saya`;
  await sendAuthEmail({
    to: ownerEmail,
    subject: `Penawaran baru untuk "${jobTitle}"`,
    body: `Halo${ownerName ? ` ${ownerName}` : ""}, ${technicianName} mengajukan penawaran ${priceFmt} untuk pekerjaan Anda.`,
    actionUrl: url,
    actionLabel: "Lihat penawaran",
  });
}

export async function sendOfferAcceptedEmail(
  technicianEmail: string,
  technicianName: string | null,
  jobTitle: string,
) {
  const url = `${config.frontendUrl}/dasbor-tukang`;
  await sendAuthEmail({
    to: technicianEmail,
    subject: `Penawaran Anda diterima — ${jobTitle}`,
    body: `Halo${technicianName ? ` ${technicianName}` : ""}, pelanggan menerima penawaran Anda untuk "${jobTitle}". Menunggu pembayaran.`,
    actionUrl: url,
    actionLabel: "Buka dasbor tukang",
  });
}

export async function sendPaymentConfirmedEmail(
  recipientEmail: string,
  recipientName: string | null,
  jobTitle: string,
  role: "owner" | "technician",
) {
  const url = role === "owner" ? `${config.frontendUrl}/pekerjaan-saya` : `${config.frontendUrl}/dasbor-tukang`;
  const label = role === "owner" ? "Lihat pekerjaan saya" : "Buka dasbor tukang";
  await sendAuthEmail({
    to: recipientEmail,
    subject: `Pembayaran dikonfirmasi — ${jobTitle}`,
    body: `Halo${recipientName ? ` ${recipientName}` : ""}, pembayaran untuk "${jobTitle}" telah dikonfirmasi. Pekerjaan siap dimulai.`,
    actionUrl: url,
    actionLabel: label,
  });
}

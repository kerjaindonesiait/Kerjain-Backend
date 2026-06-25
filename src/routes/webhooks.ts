import { Router } from "express";
import { db } from "../db.js";
import { verifyMidtransSignature } from "../utils/midtrans.js";
import { escrowReleaseAtFromNow } from "../utils/jobWorkspace.js";
import { sendPaymentConfirmedEmail } from "../utils/notifyEmails.js";

const router = Router();

async function markPaymentSuccess(paymentId: string, jobId: string) {
  await db
    .from("payments")
    .update({ status: "success", escrow_release_at: escrowReleaseAtFromNow() })
    .eq("id", paymentId);
  await db.from("jobs").update({ status: "in_progress" }).eq("id", jobId);
}

async function notifyPaymentParties(paymentId: string) {
  const { data: payment } = await db
    .from("payments")
    .select("id, payer_id, payee_id, job_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return;

  const { data: job } = await db.from("jobs").select("title").eq("id", payment.job_id).single();
  const [{ data: payer }, { data: payee }] = await Promise.all([
    db.from("users").select("email, full_name").eq("id", payment.payer_id).single(),
    db.from("users").select("email, full_name").eq("id", payment.payee_id).single(),
  ]);

  const title = job?.title ?? "Pekerjaan";
  if (payer?.email) {
    sendPaymentConfirmedEmail(payer.email, payer.full_name, title, "owner").catch(console.error);
  }
  if (payee?.email) {
    sendPaymentConfirmedEmail(payee.email, payee.full_name, title, "technician").catch(console.error);
  }
}

router.post("/midtrans", async (req, res) => {
  try {
    const body = req.body as {
      order_id?: string;
      transaction_status?: string;
      status_code?: string;
      gross_amount?: string;
      signature_key?: string;
    };

    const orderId = body.order_id;
    const status = body.transaction_status;
    if (!orderId) return res.status(400).json({ error: "order_id required" });

    if (body.signature_key && body.status_code && body.gross_amount) {
      const valid = verifyMidtransSignature(
        orderId,
        body.status_code,
        body.gross_amount,
        body.signature_key,
      );
      if (!valid) return res.status(403).json({ error: "Invalid signature" });
    }

    const { data: payment } = await db
      .from("payments")
      .select("id, job_id, status")
      .eq("transaction_id", orderId)
      .maybeSingle();

    if (!payment) return res.json({ ok: true, message: "Payment not found, ignored" });
    if (payment.status === "success" || payment.status === "released") {
      return res.json({ ok: true, message: "Already processed" });
    }

    if (status === "capture" || status === "settlement") {
      await markPaymentSuccess(payment.id, payment.job_id);
      notifyPaymentParties(payment.id).catch(console.error);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export { markPaymentSuccess, notifyPaymentParties };
export default router;

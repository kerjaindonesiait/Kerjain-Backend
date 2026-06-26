import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { escrowReleaseAtFromNow } from "../utils/jobWorkspace.js";
import { createSnapToken, isMidtransConfigured } from "../utils/midtrans.js";
import { markPaymentSuccess, notifyPaymentParties } from "./webhooks.js";

const router = Router();

const PLATFORM_FEE_RATE = 0.05;

function generateVaNumber() {
  const parts = Array.from({ length: 4 }, () =>
    String(Math.floor(1000 + Math.random() * 9000))
  );
  return parts.join(" ");
}

function generateOrderId() {
  return `KJ-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { jobId, offerId, method } = req.body;
    if (!jobId || !offerId || !method) {
      return res.status(400).json({ error: "jobId, offerId, and method required" });
    }

    const { data: offer, error: offerErr } = await db
      .from("offers")
      .select("*")
      .eq("id", offerId)
      .single();

    if (offerErr || !offer) return res.status(404).json({ error: "Offer not found" });
    if (offer.job_id !== jobId) return res.status(400).json({ error: "Offer does not match job" });

    const { data: job, error: jobErr } = await db
      .from("jobs")
      .select("id, user_id, title")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) return res.status(404).json({ error: "Job not found" });
    if (job.user_id !== req.user!.id) {
      return res.status(403).json({ error: "Only job owner can pay" });
    }

    const amount = offer.price;
    const platformFee = Math.round(amount * PLATFORM_FEE_RATE);
    const total = amount;
    const isVa = ["bca", "mandiri", "bri"].includes(method);
    const orderId = generateOrderId();
    const useMidtrans = isMidtransConfigured() && !isVa && method !== "card";

    const { data: payment, error } = await db
      .from("payments")
      .insert({
        job_id: jobId,
        offer_id: offerId,
        payer_id: req.user!.id,
        payee_id: offer.technician_id,
        amount,
        platform_fee: platformFee,
        total,
        method,
        status: useMidtrans ? "pending" : isVa ? "pending" : "processing",
        transaction_id: orderId,
        va_number: isVa ? generateVaNumber() : null,
      })
      .select()
      .single();

    if (error) throw error;

    let snapToken: string | null = null;
    if (useMidtrans) {
      try {
        snapToken = await createSnapToken({
          orderId,
          grossAmount: total,
          customerName: req.user!.email,
          customerEmail: req.user!.email,
          itemName: job.title,
        });
      } catch (e) {
        console.error("Midtrans Snap error:", e);
        await db.from("payments").delete().eq("id", payment.id);
        return res.status(502).json({ error: "Gagal membuat sesi pembayaran Midtrans" });
      }
    } else if (!isVa) {
      await markPaymentSuccess(payment.id, jobId);
      notifyPaymentParties(payment.id).catch(console.error);
      payment.status = "success";
    }

    res.status(201).json({
      payment: {
        id: payment.id,
        amount,
        platformFee,
        total,
        method,
        status: payment.status,
        transactionId: payment.transaction_id,
        vaNumber: payment.va_number,
        snapToken,
        midtransEnabled: isMidtransConfigured(),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment failed" });
  }
});

router.post("/:id/confirm", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data: payment, error } = await db
      .from("payments")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !payment) return res.status(404).json({ error: "Payment not found" });
    if (payment.payer_id !== req.user!.id) return res.status(403).json({ error: "Forbidden" });

    await markPaymentSuccess(payment.id, payment.job_id);
    notifyPaymentParties(payment.id).catch(console.error);

    res.json({ payment: { ...payment, status: "success" } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Confirmation failed" });
  }
});

router.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { data, error } = await db.from("payments").select("*").eq("id", req.params.id).single();
  if (error || !data) return res.status(404).json({ error: "Payment not found" });
  res.json({ payment: data });
});

export default router;

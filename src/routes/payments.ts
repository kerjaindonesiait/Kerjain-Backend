import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { escrowReleaseAtFromNow } from "../utils/jobWorkspace.js";

const router = Router();

const PLATFORM_FEE_RATE = 0.05;

function generateVaNumber() {
  const parts = Array.from({ length: 4 }, () =>
    String(Math.floor(1000 + Math.random() * 9000))
  );
  return parts.join(" ");
}

router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { jobId, offerId, method } = req.body;
    if (!jobId || !offerId || !method) {
      return res.status(400).json({ error: "jobId, offerId, and method required" });
    }

    const { data: offer, error: offerErr } = await db
      .from("offers")
      .select("*, job:jobs(*)")
      .eq("id", offerId)
      .single();

    if (offerErr || !offer) return res.status(404).json({ error: "Offer not found" });
    if (offer.job_id !== jobId) return res.status(400).json({ error: "Offer does not match job" });
    if (offer.job.user_id !== req.user!.id) {
      return res.status(403).json({ error: "Only job owner can pay" });
    }

    const amount = offer.price;
    const platformFee = Math.round(amount * PLATFORM_FEE_RATE);
    const total = amount + platformFee;
    const isVa = ["bca", "mandiri", "bri"].includes(method);

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
        status: isVa ? "pending" : "processing",
        transaction_id: `TXN-${Date.now()}`,
        va_number: isVa ? generateVaNumber() : null,
      })
      .select()
      .single();

    if (error) throw error;

    if (!isVa) {
      await db.from("payments").update({
        status: "success",
        escrow_release_at: escrowReleaseAtFromNow(),
      }).eq("id", payment.id);
      await db.from("jobs").update({ status: "in_progress" }).eq("id", jobId);
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

    await db.from("payments").update({
      status: "success",
      escrow_release_at: escrowReleaseAtFromNow(),
    }).eq("id", payment.id);
    await db.from("jobs").update({ status: "in_progress" }).eq("id", payment.job_id);

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

import crypto from "crypto";
import { config } from "../config.js";

type SnapItem = { id: string; price: number; quantity: number; name: string };

export function isMidtransConfigured() {
  return !!config.midtrans.serverKey;
}

export async function createSnapToken(opts: {
  orderId: string;
  grossAmount: number;
  customerName: string;
  customerEmail: string;
  itemName: string;
}) {
  if (!config.midtrans.serverKey) {
    throw new Error("Midtrans not configured");
  }

  const baseUrl = config.midtrans.isProduction
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";

  const payload = {
    transaction_details: {
      order_id: opts.orderId,
      gross_amount: opts.grossAmount,
    },
    customer_details: {
      first_name: opts.customerName,
      email: opts.customerEmail,
    },
    item_details: [
      {
        id: opts.orderId,
        price: opts.grossAmount,
        quantity: 1,
        name: opts.itemName.slice(0, 50),
      } satisfies SnapItem,
    ],
  };

  const auth = Buffer.from(`${config.midtrans.serverKey}:`).toString("base64");
  const res = await fetch(`${baseUrl}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Midtrans Snap failed: ${err}`);
  }

  const data = (await res.json()) as { token: string };
  return data.token;
}

export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string,
) {
  const input = `${orderId}${statusCode}${grossAmount}${config.midtrans.serverKey}`;
  const expected = crypto.createHash("sha512").update(input).digest("hex");
  return expected === signatureKey;
}

import { config } from "../config.js";

/** Send SMS via Twilio; logs to console in dev when Twilio is not configured. */
export async function sendSms(toDigits: string, body: string): Promise<boolean> {
  const { accountSid, authToken, from } = config.twilio;
  const to = toDigits.startsWith("+") ? toDigits : `+${toDigits}`;

  if (!accountSid || !authToken || !from) {
    console.log("\n--- KerjaIn SMS (dev) ---");
    console.log(`To: ${to}`);
    console.log(body);
    console.log("-------------------------\n");
    return false;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Twilio SMS error:", err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Twilio SMS fetch failed:", err);
    return false;
  }
}

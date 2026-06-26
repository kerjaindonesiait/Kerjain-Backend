import { config } from "../config.js";

export type WhatsAppSendResult = { ok: true; devCode?: string } | { ok: false; error: string };

/**
 * Send OTP via WhatsApp Business Cloud API.
 * Configure WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID when ready.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */
export async function sendWhatsAppOtp(phone: string, code: string): Promise<WhatsAppSendResult> {
  const { accessToken, phoneNumberId, templateName } = config.whatsapp;

  if (accessToken && phoneNumberId) {
    try {
      const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      const body = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: "id" },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: code }],
            },
          ],
        },
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("WhatsApp API error:", res.status, errText);
        return { ok: false, error: "Gagal mengirim OTP WhatsApp" };
      }

      return { ok: true };
    } catch (err) {
      console.error("WhatsApp send failed:", err);
      return { ok: false, error: "Gagal mengirim OTP WhatsApp" };
    }
  }

  if (!config.isProduction) {
    console.log(`[dev] WhatsApp OTP → +${phone}: ${code}`);
    return { ok: true, devCode: code };
  }

  console.warn("WhatsApp Business API not configured; OTP not delivered (set WHATSAPP_ACCESS_TOKEN)");
  return { ok: true };
}

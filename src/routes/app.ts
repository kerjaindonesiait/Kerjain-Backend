import { Router } from "express";
import { getAppSettings } from "../utils/settings.js";

const router = Router();

router.get("/config", async (_req, res) => {
  try {
    const settings = await getAppSettings();
    res.json({
      config: {
        requireVerifiedToQuote: settings.requireVerifiedToQuote,
        maintenanceMode: settings.maintenanceMode,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat konfigurasi" });
  }
});

export default router;

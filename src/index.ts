import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import jobRoutes from "./routes/jobs.js";
import offerRoutes from "./routes/offers.js";
import technicianRoutes from "./routes/technicians.js";
import paymentRoutes from "./routes/payments.js";
import uploadRoutes from "./routes/upload.js";

const app = express();
const JSON_LIMIT_DEFAULT = "256kb";
const JSON_LIMIT_UPLOAD = "8mb";

app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use("/api/upload", express.json({ limit: JSON_LIMIT_UPLOAD }));
app.use(express.json({ limit: JSON_LIMIT_DEFAULT }));
app.use(cookieParser());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/auth", authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/technicians", technicianRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/upload", uploadRoutes);

app.listen(config.port, () => {
  console.log(`KerjaIn API running on http://localhost:${config.port}`);
});

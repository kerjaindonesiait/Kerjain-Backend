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
import reviewRoutes from "./routes/reviews.js";
import adminRoutes from "./routes/admin.js";
import appRoutes from "./routes/app.js";
import webhookRoutes from "./routes/webhooks.js";
import messageRoutes from "./routes/messages.js";

const app = express();
const JSON_LIMIT_DEFAULT = "256kb";
const JSON_LIMIT_UPLOAD = "8mb";

app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  }),
);
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
app.use("/api/reviews", reviewRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/app", appRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/messages", messageRoutes);

app.listen(config.port, () => {
  console.log(`KerjaIn API running on http://localhost:${config.port}`);
});

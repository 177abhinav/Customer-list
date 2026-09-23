import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { customersRouter } from "./routes/customers.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { configureAuth, requireScope } from "./middleware/auth.js";

const app = express();

// Harmless (and unused by the browser) once behind App Router, since those
// requests are same-origin -- kept purely so `npm run dev` still works as a
// simple two-terminal local setup (frontend on 5173, backend on 8081,
// genuinely cross-origin without App Router in front).
app.use(
  cors({
    origin: config.cors.allowedOrigins,
    methods: ["GET"],
  })
);

configureAuth(app);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/customers", requireScope("Display"), customersRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`customer-list-backend listening on http://localhost:${config.port}`);
});

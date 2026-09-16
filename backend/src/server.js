import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { customersRouter } from "./routes/customers.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: config.cors.allowedOrigins,
    methods: ["GET"],
  })
);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/customers", customersRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`customer-list-backend listening on http://localhost:${config.port}`);
  if (!config.sap.username) {
    console.warn("SAP_USERNAME is not set — requests to SAP will be sent unauthenticated.");
  }
});

import { Router } from "express";
import { findCustomers } from "../service/customerService.js";

export const customersRouter = Router();

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

customersRouter.get("/", async (req, res, next) => {
  try {
    const { search, sortBy, sortDir } = req.query;
    const top = clamp(req.query.top, 1, 100, 15);
    const skip = clamp(req.query.skip, 0, Number.MAX_SAFE_INTEGER, 0);

    const { customers, count, odataUrl } = await findCustomers({ search, top, skip, sortBy, sortDir });
    res.json({ value: customers, count, odataUrl });
  } catch (err) {
    next(err);
  }
});
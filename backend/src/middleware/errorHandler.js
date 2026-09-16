import { SapODataError } from "../service/customerService.js";

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof SapODataError) {
    console.warn(`SAP OData call failed (${err.status}):`, err.body ?? err.message);
    return res.status(err.status).json({ message: err.message, status: err.status });
  }

  console.error("Unexpected error", err);
  return res.status(500).json({ message: "Unexpected server error", status: 500 });
}

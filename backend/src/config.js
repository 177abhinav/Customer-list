import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8080),

  sap: {
    baseUrl: process.env.SAP_ODATA_BASE_URL
      ?? "https://demo21.answerthinkdemo.com/sap/opu/odata/sap/API_BUSINESS_PARTNER",
    client: process.env.SAP_CLIENT ?? "100",
    username: process.env.SAP_USERNAME ?? "",
    password: process.env.SAP_PASSWORD ?? "",
    requestTimeoutMs: Number(process.env.SAP_REQUEST_TIMEOUT_MS ?? 15000),
  },

  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
};

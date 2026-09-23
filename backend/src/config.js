import "dotenv/config";

/**
 * Parses VCAP_SERVICES (injected by Cloud Foundry when a service is bound)
 * to find the credentials of the bound "destination" service instance.
 * Returns null when running locally with no such binding -- that's how the
 * app tells "local dev" apart from "deployed on CF with a destination bound".
 */
function findDestinationServiceCredentials() {
  const raw = process.env.VCAP_SERVICES;
  if (!raw) return null;

  let vcap;
  try {
    vcap = JSON.parse(raw);
  } catch {
    return null;
  }

  const instances = vcap.destination;
  if (!Array.isArray(instances) || instances.length === 0) return null;

  return instances[0].credentials ?? null;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),

  sap: {
    // Local-dev fallback only. Once a destination service is bound (see
    // destinationService.js), the URL and credentials come from BTP instead
    // and these are ignored.
    baseUrl: process.env.SAP_ODATA_BASE_URL
      ?? "https://demo21.answerthinkdemo.com/sap/opu/odata/sap/API_BUSINESS_PARTNER",
    client: process.env.SAP_CLIENT ?? "100",
    username: process.env.SAP_USERNAME ?? "",
    password: process.env.SAP_PASSWORD ?? "",
    requestTimeoutMs: Number(process.env.SAP_REQUEST_TIMEOUT_MS ?? 15000),
  },

  destination: {
    // The name configured in BTP cockpit -> Connectivity -> Destinations.
    name: process.env.SAP_DESTINATION_NAME ?? "S4-CUSTOMER-API",
    serviceCredentials: findDestinationServiceCredentials(),
  },

  cors: {
    // Only matters for local `npm run dev` (frontend on 5173, backend on
    // 8081 -- genuinely cross-origin). Irrelevant once deployed behind App
    // Router, where the browser only ever talks to App Router's single
    // origin and this header is never even checked.
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
};


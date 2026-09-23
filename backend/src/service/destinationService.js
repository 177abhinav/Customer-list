import { config } from "../config.js";

/**
 * Resolves how to actually reach SAP: either through a BTP Destination
 * (when this app is running on Cloud Foundry with a "destination" service
 * bound) or through plain .env credentials (when running locally, where
 * there's no VCAP_SERVICES and no bound service to ask).
 *
 * Both paths return the same shape -- { baseUrl, headers } -- so
 * customerService.js doesn't need to know or care which mode it's in.
 */

// Simple in-memory caches so we're not hitting BTP's token/destination
// endpoints on every single request. Tokens are cached until just before
// they actually expire; the resolved destination is cached for a short,
// fixed window so a credential change in the cockpit takes effect within
// a few minutes without needing to restart the app.
let cachedToken = null; // { value, expiresAt }
let cachedDestination = null; // { value, expiresAt }

const DESTINATION_CACHE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Gets an OAuth2 access token for calling the Destination service itself,
 * using the client credentials BTP injected when the service was bound
 * (cf bind-service). This token proves "this app is allowed to ask BTP for
 * destinations" -- it has nothing to do with the SAP credentials yet.
 */
async function getDestinationServiceToken(creds) {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const tokenUrl = `${creds.url}/oauth/token?grant_type=client_credentials`;
  const basicAuth = Buffer.from(`${creds.clientid}:${creds.clientsecret}`).toString("base64");

  const res = await fetch(tokenUrl, {
    method: "GET",
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  if (!res.ok) {
    throw new Error(`Could not get a token from the Destination service's UAA (${res.status})`);
  }

  const json = await res.json();
  cachedToken = {
    value: json.access_token,
    // Refresh a little early (60s) rather than exactly at expiry.
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

/**
 * Asks the Destination service to resolve a destination by name -- SAP
 * returns the target URL plus a ready-to-use Authorization header (for
 * BasicAuthentication destinations, it builds the base64 Basic header for
 * us from the stored credentials, so this code never sees the raw
 * username/password at all).
 */
async function fetchDestination(creds, token) {
  const url = `${creds.uri}/destination-configuration/v1/destinations/${config.destination.name}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Destination "${config.destination.name}" could not be resolved (${res.status}): ${body}`
    );
  }

  const json = await res.json();

  const destinationUrl = json.destinationConfiguration?.URL;
  const authHeader = json.authTokens?.[0]?.http_header;

  if (!destinationUrl || !authHeader) {
    throw new Error(
      `Destination "${config.destination.name}" is missing a URL or resolved auth token -- check its configuration in the BTP cockpit.`
    );
  }

  return {
    baseUrl: destinationUrl,
    headers: { [authHeader.key]: authHeader.value },
  };
}

/**
 * The one function customerService.js actually calls. Picks the mode
 * automatically based on whether a destination service is bound.
 */
export async function resolveSapConnection() {
  const creds = config.destination.serviceCredentials;

  if (!creds) {
    // Local dev fallback: build the same shape by hand from .env.
    const headers = {};
    if (config.sap.username) {
      const token = Buffer.from(`${config.sap.username}:${config.sap.password}`).toString("base64");
      headers.Authorization = `Basic ${token}`;
    }
    return { baseUrl: config.sap.baseUrl, headers };
  }

  if (cachedDestination && cachedDestination.expiresAt > Date.now()) {
    return cachedDestination.value;
  }

  const token = await getDestinationServiceToken(creds);
  const resolved = await fetchDestination(creds, token);

  cachedDestination = { value: resolved, expiresAt: Date.now() + DESTINATION_CACHE_MS };
  return resolved;
}
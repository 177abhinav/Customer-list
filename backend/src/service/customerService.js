import { config } from "../config.js";
import { buildFilter } from "./odataFilterBuilder.js";

class SapODataError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "SapODataError";
    this.status = status;
    this.body = body;
  }
}

function authHeader() {
  if (!config.sap.username) return {};
  const token = Buffer.from(`${config.sap.username}:${config.sap.password}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

/**
 * A_Customer only carries account/billing role fields (payment terms, tax
 * numbers, billing blocks) -- no name, address, phone, or email. Those live
 * on A_BusinessPartner and, one and two hops further, on
 * A_BusinessPartnerAddress / A_AddressEmailAddress / A_AddressPhoneNumber.
 * So the list is driven from A_BusinessPartner, filtered down to BPs that
 * hold a Customer role, with a nested $expand pulling address + contact
 * details in the same round trip.
 */
const SELECT_FIELDS = [
  "BusinessPartner",
  "Customer",
  "OrganizationBPName1",
  "FirstName",
  "LastName",
  "BusinessPartnerFullName",
  // OData V2 gotcha: when $select is combined with $expand, SAP Gateway
  // requires the navigation property's own name to be listed here too --
  // otherwise it silently strips the expanded data from the response
  // instead of erroring, even though the expand itself "succeeds".
  "to_BusinessPartnerAddress",
].join(",");

const EXPAND = "to_BusinessPartnerAddress/to_EmailAddress,to_BusinessPartnerAddress/to_PhoneNumber";

function buildQuery({ filter, top, skip }) {
  const parts = [
    `$format=json`,
    `sap-client=${encodeURIComponent(config.sap.client)}`,
    `$select=${SELECT_FIELDS}`,
    `$expand=${encodeURIComponent(EXPAND)}`,
    `$filter=${encodeURIComponent(filter)}`,
    `$top=${top}`,
    `$skip=${skip}`,
    `$inlinecount=allpages`,
  ];
  return parts.join("&");
}

/** Picks the most useful single value out of a V2 expanded collection. */
function firstResult(expandedNav) {
  return expandedNav?.results?.[0] ?? null;
}

/**
 * Flattens the deeply-nested V2 response into a display-friendly shape:
 * one row per Business Partner, with the first address/email/phone (or the
 * one flagged default, when present) pulled up to the top level.
 */
function flattenBusinessPartner(bp) {
  const address = firstResult(bp.to_BusinessPartnerAddress);
  const email = address ? firstResult(address.to_EmailAddress) : null;
  const phone = address ? firstResult(address.to_PhoneNumber) : null;

  return {
    BusinessPartner: bp.BusinessPartner,
    Customer: bp.Customer,
    Name: bp.OrganizationBPName1 || bp.BusinessPartnerFullName
      || [bp.FirstName, bp.LastName].filter(Boolean).join(" ") || null,
    CityName: address?.CityName ?? null,
    Country: address?.Country ?? null,
    PostalCode: address?.PostalCode ?? null,
    EmailAddress: email?.EmailAddress ?? null,
    PhoneNumber: phone?.PhoneNumber ?? null,
  };
}

/**
 * Fetches a page of customers (as Business Partners holding a Customer role)
 * from SAP.
 *
 * @returns {Promise<{ customers: object[], count: number|null }>}
 */
export async function findCustomers({ search, top, skip }) {
  const filter = buildFilter({ search });
  const query = buildQuery({ filter, top, skip });
  const url = `${config.sap.baseUrl}/A_BusinessPartner?${query}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.sap.requestTimeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...authHeader(),
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new SapODataError("Timed out waiting for the SAP OData service", 504, null);
    }
    throw new SapODataError(`Could not reach the SAP OData service: ${err.message}`, 502, null);
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();

  if (!response.ok) {
    throw new SapODataError(
      text || `SAP OData service returned ${response.status}`,
      response.status,
      text
    );
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SapODataError("SAP OData service returned a non-JSON response", 502, text);
  }

  const d = json.d ?? {};
  const results = Array.isArray(d.results) ? d.results : [];
  const count = d.__count != null ? Number(d.__count) : null;

  return { customers: results.map(flattenBusinessPartner), count, odataUrl: url };
}

export { SapODataError };

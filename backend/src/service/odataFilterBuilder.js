/**
 * Builds OData V2 $filter expressions against the A_BusinessPartner entity
 * set (NOT A_Customer -- see customerService.js for why).
 *
 * Always restricts to Business Partners that actually hold a Customer role
 * (Customer ne ''), then layers an optional free-text search on top using
 * substringof(), V2's equivalent of V4's contains() (note the reversed
 * argument order: substringof('term', Field), not contains(Field,'term')).
 */

function escape(value) {
  return value.replace(/'/g, "''");
}

export function buildFilter({ search }) {
  const clauses = ["Customer ne ''"];

  if (search?.trim()) {
    const term = escape(search.trim());
    clauses.push(
      `(substringof('${term}',OrganizationBPName1) eq true ` +
      `or substringof('${term}',BusinessPartnerFullName) eq true ` +
      `or substringof('${term}',Customer) eq true)`
    );
  }

  return clauses.join(" and ");
}

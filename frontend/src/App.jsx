import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, RefreshCw, ChevronLeft, ChevronRight, AlertCircle, Mail, Phone, Code2, Copy, Check } from "lucide-react";

/**
 * Customer List
 * ------------------------------------------------------------------
 * Calls the Express backend (see ../backend), which proxies SAP's
 * API_BUSINESS_PARTNER OData v2 service (A_Customer entity set). The
 * backend holds the SAP Basic Auth credentials and the sap-client
 * parameter — this component only ever sends plain REST query params
 * (search, top, skip).
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8081/api/customers";
const PAGE_SIZE = 15;

function buildQueryString({ search, top, skip }) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  params.set("top", String(top));
  params.set("skip", String(skip));
  return params.toString();
}

// ---- Data hook ------------------------------------------------------------

function useCustomers(filters, page) {
  const [data, setData] = useState([]);
  const [count, setCount] = useState(null);
  const [odataUrl, setOdataUrl] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | error | ready
  const [error, setError] = useState(null);

  const query = useMemo(
    () => buildQueryString({ ...filters, top: PAGE_SIZE, skip: page * PAGE_SIZE }),
    [filters, page]
  );

  const fetchData = useCallback(
    async (signal) => {
      setStatus("loading");
      setError(null);
      try {
        const res = await fetch(`${API_BASE}?${query}`, {
          headers: { Accept: "application/json" },
          signal,
        });
        if (!res.ok) {
          let message = `Request failed (${res.status})`;
          try {
            const body = await res.json();
            if (body?.message) message = body.message;
          } catch {
            /* non-JSON error body — keep the generic message */
          }
          throw new Error(message);
        }
        const json = await res.json();
        setData(json.value ?? []);
        setCount(typeof json.count === "number" ? json.count : null);
        setOdataUrl(typeof json.odataUrl === "string" ? json.odataUrl : null);
        setStatus("ready");
      } catch (err) {
        if (err.name === "AbortError") return;
        setError(err.message || "Something went wrong fetching customers.");
        setStatus("error");
      }
    },
    [query]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return { data, count, odataUrl, status, error, refetch: () => fetchData() };
}

// ---- UI pieces --------------------------------------------------------

function StatusBanner({ status, error, onRetry }) {
  if (status === "error") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Couldn't load customers</p>
          <p className="mt-0.5 text-red-700">{error}</p>
        </div>
        <button
          onClick={onRetry}
          className="shrink-0 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          Retry
        </button>
      </div>
    );
  }
  return null;
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Shows the exact OData v2 URL the backend just called SAP with -- a debug
 * aid so search/pagination changes are visible as real query strings, not
 * a black box. The URL comes straight from the backend's response
 * (findCustomers returns the `url` it built), so this is never
 * reconstructed or guessed on the frontend -- it's the literal request.
 */
function ODataQueryPanel({ url }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!url) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard permissions can fail silently -- not critical */
    }
  };

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-slate-400" />
          OData query sent to SAP
        </span>
        <span className="text-xs text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <code className="flex-1 select-all break-all font-mono text-xs leading-relaxed text-slate-700">
              {url}
            </code>
            <button
              onClick={handleCopy}
              className="flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              title="Copy URL"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            This is the real request the backend just sent to SAP for the current search/page — paste it in a browser (with SAP login) to see the raw response yourself.
          </p>
        </div>
      )}
    </div>
  );
}

function CustomerCard({ customer }) {
  const name = customer.Name || customer.Customer;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-600">
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-medium text-slate-900">{name || "—"}</p>
          <span className="shrink-0 text-xs text-slate-400">{customer.Customer}</span>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          {[customer.CityName, customer.Country].filter(Boolean).join(", ") || "No address on file"}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {customer.PhoneNumber && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> {customer.PhoneNumber}
            </span>
          )}
          {customer.EmailAddress && (
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" /> {customer.EmailAddress}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Root component -----------------------------------------------------

export default function App() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters = useMemo(
    () => ({ search: debouncedSearch }),
    [debouncedSearch]
  );

  useEffect(() => setPage(0), [filters]);

  const { data, count, odataUrl, status, error, refetch } = useCustomers(filters, page);

  const totalPages = count != null ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : null;
  const hasNext = totalPages != null ? page + 1 < totalPages : data.length === PAGE_SIZE;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Live from S/4HANA <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">API_BUSINESS_PARTNER</code> (A_BusinessPartner, filtered to customers).
          </p>
        </header>

        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-600">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Company/person name or customer ID"
                className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </label>
          <p className="mt-2 text-xs text-slate-400">
            Country/city filtering isn't included — OData V2 can't filter on a nested $expand'd property, only display it (see backend/README for why).
          </p>
        </div>

        <ODataQueryPanel url={odataUrl} />

        <div className="mb-3">
          <StatusBanner status={status} error={error} onRetry={refetch} />
        </div>

        <div className={`space-y-2 ${status === "loading" ? "opacity-50 transition-opacity" : "transition-opacity"}`}>
          {data.length === 0 && status !== "loading" && (
            <div className="rounded-lg border border-dashed border-slate-200 bg-white py-10 text-center text-slate-400">
              No customers match these filters.
            </div>
          )}
          {data.map((customer) => (
            <CustomerCard key={customer.Customer} customer={customer} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            {status === "loading" && data.length === 0
              ? "Loading…"
              : count != null
              ? `${count} result${count === 1 ? "" : "s"}`
              : `Page ${page + 1}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
              className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={refetch}
              className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 hover:bg-slate-50"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

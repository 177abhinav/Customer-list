import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, AlertCircle, Mail, Phone,
  Code2, Copy, Check, ArrowUpDown, X, Users,
} from "lucide-react";

/**
 * Customer List
 * ------------------------------------------------------------------
 * Calls the Express backend, which proxies SAP's API_BUSINESS_PARTNER
 * OData v2 service (A_BusinessPartner, filtered to Customer roles -- see
 * customerService.js for why not A_Customer). Sorting is real, server-side
 * $orderby. Country/city is a client-side quick filter, labeled as such,
 * since OData v2 can't $filter on the $expand'd address data server-side.
 */
// Defaults to a relative path -- correct once served through App Router,
// where the browser only ever sees one origin and /api/customers resolves
// to it automatically. For plain local `npm run dev` (no App Router
// running), .env overrides this to the backend's own absolute URL.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/customers";

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50];
const SORT_OPTIONS = [
  { value: "name-asc", label: "Name (A→Z)", sortBy: "name", sortDir: "asc" },
  { value: "name-desc", label: "Name (Z→A)", sortBy: "name", sortDir: "desc" },
  { value: "customer-asc", label: "Customer ID (low→high)", sortBy: "customer", sortDir: "asc" },
  { value: "customer-desc", label: "Customer ID (high→low)", sortBy: "customer", sortDir: "desc" },
];

// Deterministic accent color per customer, so the same name always gets the
// same avatar color across reloads/pages -- not random, not decorative.
const AVATAR_HUES = [
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-sky-100", text: "text-sky-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
];
function avatarStyle(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
}

function buildQueryString({ search, top, skip, sortBy, sortDir }) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  params.set("top", String(top));
  params.set("skip", String(skip));
  params.set("sortBy", sortBy);
  params.set("sortDir", sortDir);
  return params.toString();
}

// ---- Data hook ------------------------------------------------------------

function useCustomers(filters, page, pageSize) {
  const [data, setData] = useState([]);
  const [count, setCount] = useState(null);
  const [odataUrl, setOdataUrl] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const query = useMemo(
    () => buildQueryString({ ...filters, top: pageSize, skip: page * pageSize }),
    [filters, page, pageSize]
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
            /* non-JSON error body */
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

// ---- Small UI pieces --------------------------------------------------------

function StatusBanner({ status, error, onRetry }) {
  if (status !== "error") return null;
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

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function CustomerCard({ customer }) {
  const name = customer.Name || customer.Customer;
  const hue = avatarStyle(customer.Customer || name || "?");
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${hue.bg} ${hue.text}`}>
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-medium text-slate-900">{name || "—"}</p>
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
            {customer.Customer}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          {[customer.CityName, customer.Country].filter(Boolean).join(", ") || "No address on file"}
        </p>
        {(customer.PhoneNumber || customer.EmailAddress) && (
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
        )}
      </div>
    </div>
  );
}

function CustomerCardSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-slate-100" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

/** Collapsible panel showing the literal OData URL the backend just called. */
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
      /* clipboard permissions can fail silently */
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
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1.5 text-xs text-slate-600">
      {label}
      <button
        onClick={onClear}
        className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="Clear"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ---- Root component -----------------------------------------------------

export default function App() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState(""); // client-side, this page only
  const [sort, setSort] = useState(SORT_OPTIONS[0]);
  const [pageSize, setPageSize] = useState(15);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters = useMemo(
    () => ({ search: debouncedSearch, sortBy: sort.sortBy, sortDir: sort.sortDir }),
    [debouncedSearch, sort]
  );

  useEffect(() => setPage(0), [filters, pageSize]);

  const { data, count, odataUrl, status, error, refetch } = useCustomers(filters, page, pageSize);

  const visibleData = useMemo(() => {
    const q = quickFilter.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) =>
      (c.CityName || "").toLowerCase().includes(q) || (c.Country || "").toLowerCase().includes(q)
    );
  }, [data, quickFilter]);

  const totalPages = count != null ? Math.max(1, Math.ceil(count / pageSize)) : null;
  const hasNext = totalPages != null ? page + 1 < totalPages : data.length === pageSize;
  const activeFilterCount = (debouncedSearch ? 1 : 0) + (quickFilter ? 1 : 0);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
            <p className="text-sm text-slate-500">
              Live from S/4HANA <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">API_BUSINESS_PARTNER</code>
            </p>
          </div>
        </header>

        {/* Toolbar */}
        <div className="mb-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
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

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-600">Sort by</span>
              <div className="relative">
                <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  value={sort.value}
                  onChange={(e) => setSort(SORT_OPTIONS.find((o) => o.value === e.target.value))}
                  className="rounded-md border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-600">Per page</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-col gap-1 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <span>Quick filter city/country</span>
              <input
                value={quickFilter}
                onChange={(e) => setQuickFilter(e.target.value)}
                placeholder="e.g. Germany"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-slate-400"
              />
            </label>
            {/* <p className="text-[11px] text-slate-400">
  Not a server search — OData V2 can't $filter on address data pulled in via $expand, so this only narrows what's already on the current page.
            </p> */}
          </div>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {debouncedSearch && (
              <FilterChip label={`Search: "${debouncedSearch}"`} onClear={() => setSearchInput("")} />
            )}
            {quickFilter && (
              <FilterChip label={`City/Country: "${quickFilter}"`} onClear={() => setQuickFilter("")} />
            )}
          </div>
        )}

        <ODataQueryPanel url={odataUrl} />

        <div className="mb-3">
          <StatusBanner status={status} error={error} onRetry={refetch} />
        </div>

        {/* Results */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {status === "loading" && data.length === 0 &&
            Array.from({ length: 6 }).map((_, i) => <CustomerCardSkeleton key={i} />)}

          {status !== "loading" && visibleData.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-slate-200 bg-white py-10 text-center text-slate-400">
              {quickFilter ? "No customers on this page match that quick filter." : "No customers match these filters."}
            </div>
          )}

          {visibleData.map((customer) => (
            <CustomerCard key={customer.Customer} customer={customer} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            {status === "loading" && data.length === 0
              ? "Loading…"
              : count != null
              ? `${count} result${count === 1 ? "" : "s"}${quickFilter ? ` (${visibleData.length} shown)` : ""}`
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

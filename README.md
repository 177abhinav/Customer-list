# Customer List App

Lists SAP Business Partners that hold a Customer role, via the standard
`API_BUSINESS_PARTNER` OData **v2** service, with name/ID search.

```
customer-list-app/
├── backend/    Node.js (Express) proxy — holds SAP Basic Auth creds
└── frontend/   React + Vite + Tailwind UI
```

## Why the list is built from A_BusinessPartner, not A_Customer

Checking the real `$metadata` for this service turned up something worth
knowing about this data model: `A_Customer` only carries account/billing
role fields (payment terms, tax numbers, billing/delivery blocks) — it has
**no name, address, phone, or email properties at all**. Those live on:

- `A_BusinessPartner` — `OrganizationBPName1`, `FirstName`, `LastName`
- `A_BusinessPartnerAddress` — `CityName`, `Country`, `PostalCode`, `StreetName` (one hop from the BP via `to_BusinessPartnerAddress`)
- `A_AddressEmailAddress` / `A_AddressPhoneNumber` — `EmailAddress` / `PhoneNumber` (a second hop, from the address via `to_EmailAddress` / `to_PhoneNumber`)

`A_CustomerType`'s own navigation properties (`to_CustomerCompany`,
`to_CustomerSalesArea`, `to_CustomerTaxGrouping`, etc.) don't lead back up
to the Business Partner or an address either, so there's no way to get
contact details starting from `A_Customer`.

So the backend queries `A_BusinessPartner`, filtered to `Customer ne ''`
(only BPs that hold a Customer role), with a nested V2 `$expand`:

```
$expand=to_BusinessPartnerAddress/to_EmailAddress,to_BusinessPartnerAddress/to_PhoneNumber
```

— pulling name, address, email, and phone in one round trip instead of
four separate calls per customer. The backend then flattens that
deeply-nested response (`to_BusinessPartnerAddress.results[0]...`) into a
simple `{ Name, CityName, Country, EmailAddress, PhoneNumber, ... }` shape
for the frontend.

**Known limitation:** OData V2 can't `$filter` on a property of an
`$expand`ed nested entity, so a Country filter can't be done server-side
here the way the search box can — that's why there's no Country input in
the UI. A real fix would be a custom CDS view/service that flattens
address fields onto the BP directly; happy to sketch that if useful.

## Why a backend proxy at all

Same as before: this service authenticates with HTTP Basic Auth, which a
browser can't do safely (password exposed client-side, and blocked by CORS
on most SAP systems). The backend holds the credentials server-side.

**About the credentials shared in this conversation:** treat that password
as compromised since it was typed in plain chat — rotate it on the SAP
side before relying on this outside a disposable training tenant. They are
not hardcoded anywhere in this project; provide them via `backend/.env`
(git-ignored).

## Running it

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env: SAP_USERNAME=rkirlampudi, SAP_PASSWORD=<your password>
npm run dev
```

Starts on `http://localhost:8080`. Sanity check:

```bash
curl "http://localhost:8080/api/customers?top=5"
curl "http://localhost:8080/health"
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Opens on `http://localhost:5173`.

## What each side does

**Backend** (`backend/src/`)
- `routes/customers.js` — `GET /api/customers?search=&top=&skip=`
- `service/odataFilterBuilder.js` — `Customer ne ''` always applied, plus an optional `substringof(...)` search across `OrganizationBPName1`, `BusinessPartnerFullName`, and `Customer`
- `service/customerService.js` — builds the V2 query (`$select`, nested `$expand`, `$filter`, `$top`, `$skip`, `$inlinecount=allpages`), calls SAP with Basic Auth, and flattens the nested V2 envelope into a simple row shape
- `middleware/errorHandler.js` — SAP errors/timeouts → clean JSON

**Frontend** (`frontend/src/App.jsx`)
- Debounced search box (name or customer ID)
- Card list with pagination, showing name, city/country (when present), phone, email
- Talks only to the backend's `/api/customers` — never to SAP directly

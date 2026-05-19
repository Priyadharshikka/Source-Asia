# Source Asia — Backend Assignment (Node.js)

A single Node.js + Express HTTP service that implements both required parts of the assignment:

1. **Part 1** — Rate-limited API (`POST /request`, `GET /stats`)
2. **Part 2** — Product catalog with media (`POST /products`, `GET /products`, `GET /products/:id`, `POST /products/:id/media`)

Both parts run inside the **same process on the same port**, in one repo, with in-memory storage.

---

## 1. Quick start

```bash
cd Source-Asia
npm install
npm start
# server: http://localhost:3000
```

Optional:
```bash
npm run dev          # node --watch for auto-reload
PORT=4000 npm start  # override port
npm test             # run unit tests (node:test)
npm run seed         # POST 1,000 products (server must be running)
```

Health check:
```bash
curl http://localhost:3000/health
```

---

## 2. Project layout

```
Source-Asia/
├── package.json
├── README.md
├── scripts/
│   └── seed.js                       # optional: seed 1k products to prove list perf
├── src/
│   ├── server.js                     # entry: process boot + graceful shutdown
│   ├── app.js                        # express wiring
│   ├── config.js                     # all tunables in one place
│   ├── middleware/
│   │   └── errorHandler.js           # 400 on bad JSON, ApiError→JSON, 500 fallback
│   ├── modules/
│   │   ├── rateLimit/                # Part 1
│   │   │   ├── rateLimit.routes.js
│   │   │   ├── rateLimit.controller.js
│   │   │   ├── rateLimit.service.js  # validation + business logic
│   │   │   └── rateLimit.store.js    # in-memory state, concurrency-safe
│   │   └── products/                 # Part 2
│   │       ├── products.routes.js
│   │       ├── products.controller.js
│   │       ├── products.service.js
│   │       ├── products.store.js     # split storage: summaries vs media
│   │       └── products.validator.js
│   └── utils/
│       ├── ApiError.js               # typed HTTP errors
│       └── asyncHandler.js
└── tests/
    ├── rateLimit.store.test.js
    └── products.store.test.js
```

**Layered design:** `routes → controller (HTTP I/O) → service (validation + rules) → store (state)`. Stores are pure JS classes with no Express dependency, so they are trivially unit-testable.

---

## 3. Part 1 — Rate-limited API

### Endpoints

#### `POST /request`

Request body:
```json
{ "user_id": "alice", "payload": { "anything": "any JSON value" } }
```

Success: **`201 Created`** (chosen because a new accepted request resource is logically created in the per-user window).

Success body:
```json
{
  "user_id": "alice",
  "accepted": true,
  "accepted_in_current_window": 3,
  "max_accepted_per_window": 5,
  "window_ms": 60000,
  "payload_received": true
}
```

Errors:
- `400 Bad Request` — missing/empty `user_id`, missing `payload`, or invalid JSON body
- `429 Too Many Requests` — rate-limit exceeded; body includes `retry_after_ms` and `retry_after_seconds`

429 body:
```json
{
  "error": {
    "code": "rate_limited",
    "message": "Rate limit exceeded: max 5 requests per 60s per user_id",
    "details": {
      "user_id": "alice",
      "retry_after_ms": 42137,
      "retry_after_seconds": 43,
      "accepted_in_current_window": 5,
      "max_accepted_per_window": 5
    }
  }
}
```

#### `GET /stats`

- `GET /stats` → returns global totals and per-user array.
- `GET /stats?user_id=alice` → returns stats for a single user.

Per-user shape:
```json
{
  "user_id": "alice",
  "accepted_in_current_window": 3,
  "rejected_total": 7,
  "window_ms": 60000,
  "max_accepted_per_window": 5
}
```

Global shape:
```json
{
  "window_ms": 60000,
  "max_accepted_per_window": 5,
  "totals": { "users": 2, "accepted_in_current_window": 5, "rejected_total": 9 },
  "users": [
    { "user_id": "alice", "accepted_in_current_window": 3, "rejected_total": 7 },
    { "user_id": "bob",   "accepted_in_current_window": 2, "rejected_total": 2 }
  ]
}
```

### Rate-limit algorithm

- **Rolling 1-minute window**, max **5 accepted requests per `user_id`**.
- Implemented as a **sliding-window log**: per user we keep a sorted array of accept-timestamps. On each request we prune entries older than `now - 60s`, then accept if length `< 5`, else reject.
- `rejected_total` is **cumulative for the lifetime of the process** (not per-window). This is documented as the more useful operator metric. `accepted_in_current_window` is, as required, the live count in the current rolling 60s window.

### Concurrency correctness

Node.js runs JavaScript on a single thread. `RateLimitStore.tryAccept` performs **no `await`** between reading and writing the bucket, so a concurrent burst of HTTP requests for the same `user_id` cannot interleave: each call runs atomically to completion before the next handler tick. This is why the implementation needs no explicit mutex.

You can verify concurrency safety with:
```bash
# 20 parallel requests for the same user — expect 5 accepted, 15 rejected.
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/request \
    -H 'Content-Type: application/json' \
    -d '{"user_id":"alice","payload":{"i":'"$i"'}}' &
done | sort | uniq -c
wait
```

### Sample `curl`s

```bash
# Accepted
curl -i -X POST http://localhost:3000/request \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"alice","payload":{"hello":"world"}}'

# Missing user_id → 400
curl -i -X POST http://localhost:3000/request \
  -H 'Content-Type: application/json' \
  -d '{"payload":1}'

# Invalid JSON → 400
curl -i -X POST http://localhost:3000/request \
  -H 'Content-Type: application/json' \
  -d 'not-json'

# Stats
curl -s http://localhost:3000/stats | jq
curl -s 'http://localhost:3000/stats?user_id=alice' | jq
```

---

## 4. Part 2 — Product catalog with media

### Endpoints

#### `POST /products`

Request body:
```json
{
  "name": "Widget A",
  "sku": "SKU-001",
  "image_urls": ["https://cdn.example.com/products/sku-001/img-1.jpg"],
  "video_urls": ["https://cdn.example.com/products/sku-001/demo.mp4"]
}
```

- `201 Created` with the created product summary (includes the assigned `id`, a UUID v4).
- `409 Conflict` if `sku` already exists.
- `400 Bad Request` on validation failure (see below).

#### `GET /products?limit=20&offset=0`

- **List/grid endpoint.** Returns summaries only — **never** the `image_urls` / `video_urls` arrays.
- Pagination: `limit` (default `20`, max `100`), `offset` (default `0`).

Response shape:
```json
{
  "items": [
    {
      "id": "…uuid…",
      "name": "Widget A",
      "sku": "SKU-001",
      "image_count": 2,
      "video_count": 1,
      "thumbnail_url": "https://cdn.example.com/products/sku-001/img-1.jpg",
      "created_at": "2026-05-19T10:00:00.000Z"
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "total": 1000, "returned": 20, "has_more": true }
}
```

#### `GET /products/:id`

- **Detail endpoint.** Returns the full product including all `image_urls` and `video_urls`.
- `404 Not Found` if unknown.

#### `POST /products/:id/media`

Request body:
```json
{ "image_urls": ["https://…"], "video_urls": ["https://…"] }
```

- Appends URLs to the existing product (does not replace).
- `200 OK` returns the updated full product.
- `404 Not Found` if unknown `id`.
- `400 Bad Request` if both arrays are empty / missing.

### Validation rules

| Rule | Limit |
|---|---|
| `name` | non-empty after trim, ≤ 255 chars |
| `sku` | non-empty after trim, ≤ 64 chars, must be unique |
| URL scheme | must start with `http://` or `https://` |
| URL structural validity | parseable by WHATWG `new URL(...)` |
| URL max length | 2048 chars |
| URLs per array per request | max **20** |

`409 Conflict` is used for duplicate `sku` (preferred over `400` because it is a state conflict, not malformed input).

### Data model and list-vs-detail design

The store is **split into two maps** keyed by product id:

```
summaries: Map<id, { id, name, sku, image_count, video_count, thumbnail_url, created_at }>
media:     Map<id, { image_urls: string[], video_urls: string[] }>
skuIndex:  Map<sku, id>   // O(1) duplicate check
order:     id[]           // O(1) pagination slice in insertion order
```

- **`GET /products`** reads only from `summaries` (via the `order` slice). It **never touches** the `media` map, so the cost of the list call is independent of how many media URLs exist in the system.
- **`GET /products/:id`** is the only read path that joins `summaries` + `media`.
- **`POST /products/:id/media`** appends to the media arrays and increments the counts on the summary atomically (single synchronous block — no `await`).

This is what satisfies the performance rule: with 1,000 products × 10 image URLs = 10,000 URLs in `media`, `GET /products?limit=20` only iterates 20 summary objects. None of the URL arrays are read or serialised.

You can demonstrate this:
```bash
# 1) start the server
npm start

# 2) in another shell
npm run seed                      # creates 1,000 products × 10 image URLs each
time curl -s 'http://localhost:3000/products?limit=20' >/dev/null
# Expect single-digit ms on a laptop, regardless of how much media is stored.
```

### What would change with PostgreSQL + a CDN in production

- **Schema**
  - `products(id uuid pk, sku text unique, name text, created_at timestamptz, image_count int, video_count int, thumbnail_url text)`
  - `product_media(id bigserial pk, product_id uuid fk → products.id, kind text check in ('image','video'), url text, position int)`
  - Index `product_media (product_id, kind, position)`.
- **List vs detail**
  - `GET /products` → `SELECT id, name, sku, image_count, video_count, thumbnail_url, created_at FROM products ORDER BY created_at DESC, id LIMIT $1 OFFSET $2;` — never touches `product_media`. Replace offset pagination with **keyset (`WHERE (created_at,id) < ($cursor)`)** at scale.
  - `GET /products/:id` → one `products` row + one `product_media` query, optionally hydrated in parallel.
  - `POST /products/:id/media` → wrap the insert + `image_count`/`video_count` update in a transaction so counts stay consistent.
- **CDN**
  - The API still stores URLs only. The client (or an upload service) uploads bytes directly to S3/GCS using a pre-signed URL, then POSTs the resulting CDN URL here. We never proxy bytes through this service.
  - `thumbnail_url` would point at a CDN-resized variant (e.g. via Cloudflare Images / Imgix), not the original.
- **Caching**
  - The list response is highly cacheable (`Cache-Control` + ETag on `(total, last_modified)`); the detail page is cached per `id` with bust-on-write.
- **Concurrency / multi-instance**
  - Postgres `UNIQUE (sku)` enforces duplicate-sku across instances (no longer relies on a single-process map).

### Sample `curl`s

```bash
# Create
curl -i -X POST http://localhost:3000/products \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Widget A",
    "sku":"SKU-001",
    "image_urls":["https://cdn.example.com/products/sku-001/img-1.jpg"],
    "video_urls":["https://cdn.example.com/products/sku-001/demo.mp4"]
  }'

# Duplicate sku → 409
curl -i -X POST http://localhost:3000/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Widget A2","sku":"SKU-001"}'

# List
curl -s 'http://localhost:3000/products?limit=20&offset=0' | jq

# Detail
curl -s http://localhost:3000/products/<id> | jq

# Append media
curl -i -X POST http://localhost:3000/products/<id>/media \
  -H 'Content-Type: application/json' \
  -d '{"image_urls":["https://cdn.example.com/products/sku-001/img-2.jpg"]}'

# Empty media body → 400
curl -i -X POST http://localhost:3000/products/<id>/media \
  -H 'Content-Type: application/json' -d '{}'
```

---

## 5. Error format

All errors are JSON with a consistent shape:

```json
{ "error": { "code": "rate_limited", "message": "…", "details": { } } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `bad_request` | Validation failed, malformed JSON, missing fields |
| 404 | `not_found` | Unknown product id, unknown route |
| 409 | `conflict` | Duplicate `sku` on create |
| 413 | `payload_too_large` | Body > `jsonBodyLimit` (1 MB) |
| 429 | `rate_limited` | Rate limit exceeded |
| 500 | `internal_error` | Unexpected — message is generic, details logged server-side |

---

## 6. Production limitations (in-memory, single instance)

- **Single-instance only.** Both stores live in process memory; running two instances behind a load balancer would give each its own rate-limit counters and its own products map. The 5/min rule would effectively become 5/min *per instance*.
- **Restart loses all state.** No persistence is implemented (per the brief — not required).
- **Unbounded growth of rate-limit map.** `RateLimitStore.byUser` keeps a bucket per `user_id` ever seen. In production we'd evict idle buckets (e.g. TTL based on last activity) or move to Redis with key TTL.
- **Offset pagination** is O(offset) when the underlying store has many entries; for production scale we'd switch to keyset/cursor pagination.
- **What would change at scale**
  - **Rate limiting:** Redis with a Lua script implementing the same sliding-window log atomically, or a token-bucket via `INCR + EXPIRE`. Shared across instances.
  - **Catalog:** PostgreSQL with the schema in §4; media bytes on object storage behind a CDN; the API only ever handles URLs.
  - **Observability:** structured request logging, request-id propagation, metrics (`/metrics` Prometheus exporter).

---

## 7. AI tooling disclosure

GitHub Copilot (Claude) was used to scaffold the project structure, write boilerplate (routes, error middleware, validators) and draft this README. All design decisions (split-storage model, sliding-window log, sync-critical-section concurrency strategy, error shape) were specified by the author and reviewed by hand.

---

## 8. Honest notes on completeness

All required endpoints from both parts are implemented:

- Part 1: `POST /request`, `GET /stats`, 5/min rolling window, 429 on overflow, 400 on invalid input, concurrency-safe.
- Part 2: `POST /products` (with 409 on duplicate sku), `GET /products` (paginated summaries only), `GET /products/:id` (full detail), `POST /products/:id/media` (append), validation rules enforced.

A small unit-test suite (`npm test`) covers the rate-limit store and the product store. Integration/HTTP-level tests are not included.

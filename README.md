# btc-deposit-indexer

A deposit indexer for Bitcoin: it processes bitcoind's `listsinceblock` snapshots, detects
valid incoming deposits for a known set of customer addresses, and credits them. It doesn't
scan the chain itself and doesn't track spends — it's a one-way "have I seen and credited this
deposit" record layered on top of bitcoind's own wallet tracking, not a general-purpose
UTXO/address indexer.

I built this to work through a real design problem exchanges deal with constantly: crediting
customer deposits off of `bitcoind` polling data without double-crediting, losing a deposit to an
infra blip, or getting bitten by a chain reorg after a deposit was already credited.

## Spec

Given two snapshots of bitcoind's `listsinceblock` RPC (`fixtures/sample-snapshot-1.json`,
`fixtures/sample-snapshot-2.json`), a single `docker-compose up` prints a fixed 10-line summary
to stdout:

- one `Deposited for <name>: count=n sum=x.xxxxxxxx` line per known customer (7 lines)
- `Deposited without reference: count=n sum=x.xxxxxxxx` for deposits to unknown addresses
- `Smallest valid deposit: x.xxxxxxxx`
- `Largest valid deposit: x.xxxxxxxx`

A deposit is **valid** when its category is `receive` and it has **at least 6 confirmations**.

## Implementation

### Architecture

NestJS app composed of:

- **Postgres** — persistent storage (`users`, `userSummary`, `customerUtxo`, `unknownUtxo`).
- **Redis** — caches the known-address list and the per-user summary between reads.
- **RabbitMQ** — the app publishes to and consumes from its own queue, using message passing
  as an internal job runner rather than calling service methods directly.

This is intentionally more infrastructure than the task strictly requires (see
[Known limitations](#known-limitations--intentionally-out-of-scope) below) — it was a
deliberate choice to demonstrate handling of caching, transactional retries, and message-driven
processing, at the cost of more moving parts than a plain script would need.

### Processing flow

1. `main.ts` boots an application context, starts the RabbitMQ microservice consumer
   (`app.listen()`), and connects to Redis.
2. It reads both JSON files and sends each as a `PAYLOAD_PROCESS` message, **awaiting** both
   before continuing — this guarantees the summary step (next) only runs once both files have
   been fully processed, instead of relying on a fixed delay.
3. `BitcoinManagerController` receives each message and calls
   `BitcoinManagerService.processRawJSONforDeposit`, which:
   - Converts the JSON's numeric `amount` fields to strings before parsing (to avoid floating
     point precision loss on BTC amounts).
   - Runs `clientFiltering`, which:
     1. Processes any `removed` transactions first — see
        [Reorg handling](#reorg-handling-removed-transactions).
     2. Filters `transactions` down to valid deposits (`category === 'receive'` and
        `confirmations >= 6`).
     3. Splits them into known-customer vs. unknown-address deposits (known addresses are
        cached for an hour).
     4. Upserts both sets by `(txHash, vout)` — this is the natural unique key for a UTXO, and
        makes the whole pipeline idempotent: reprocessing the same file, or overlapping data
        between the two snapshot files (which the fixtures do contain), never double-counts a
        deposit.
4. Once both files are processed, `main.ts` sends a `SUMMARY` message, which calls
   `processUserSummary` to read the aggregated totals and print the 10 required lines.

### Reorg handling (`removed` transactions)

`listsinceblock` can return a `removed` array alongside `transactions`: entries that were
previously visible to the wallet but whose containing block got orphaned by a chain
reorganization, and are therefore no longer part of the best chain. A deposit that was already
credited (6+ confirmations) but then reorg'd out must not stay credited.

This is handled on every call:

- `BitcoinManagerService.clientFiltering` runs `removeReorgedDeposits(data.removed)` **before**
  applying the current batch's `transactions`, so a stale removal can never clobber a fresh
  insert if the same `(txid, vout)` were ever present in both lists in the same payload.
- `UtxoDatabaseService.removeUTXOs` deletes the matching `(txHash, vout)` rows from both
  `customerUtxo` and `unknownUtxo`, inside the same deadlock-retry transaction pattern used for
  inserts.
- Migration `AddCustomerUtxoDeleteTrigger` adds an `AFTER DELETE ON "customerUtxo"` trigger that
  recomputes `userSummary.userBalance` / `transactionCount`, mirroring the existing
  `AFTER INSERT` trigger, so a customer's balance/count stay correct once a previously credited
  deposit is reversed.
- The `UserSummary` cache key is invalidated whenever a removal touches the DB, so the next
  summary read reflects the reversal instead of a stale cached total.

Both fixture files ship `"removed": []`, so this path exists for correctness/thoroughness but
isn't exercised by the sample data — it won't change the printed output for this run.

## Design decisions

### Precision-safe money parsing

Native `JSON.parse` converts every number into an IEEE-754 double, which cannot exactly
represent most base-10 fractions — a real risk for BTC amounts regardless of magnitude.
`DataTransformationService.rawJsonNumberToStringConverter` rewrites monetary fields (`amount`,
`fee`) as quoted strings in the raw JSON text **before** `JSON.parse` ever touches them, and
`formatFromDecimalToIntegerString` converts that exact string to satoshis via string splitting,
never native float math — with the fractional part truncated (not just padded) past 8 decimals,
so a malformed >8-digit amount can't silently inflate the stored value.

This was checked against the obvious alternative rather than assumed: `json-bigint` (previously
a listed dependency) was tested directly against the fixture data and confirmed to leave decimal
`amount` values as native floats in every mode — it only protects integers that overflow safe
double range, which isn't the bug here. It and the also-unused `decimal.js` were removed rather
than kept as decorative dependencies.

### Deadlock retry: exponential backoff with full jitter

Both DB write paths (`insertUTXOs`, `removeUTXOs`) retry once on Postgres deadlock (`40P01`)
using the "full jitter" strategy (`delay = random(0, min(cap, base * 2^attempt))`) instead of a
fixed or linear delay, specifically so that if multiple transactions deadlock together, their
retries don't stay in lockstep and collide again (thundering herd).

### Message durability over default auto-ack

NestJS's RabbitMQ transport defaults to `noAck: true`, meaning a message is removed from the
queue the instant it's delivered — before the handler even runs. Under that default, a
transient Postgres/Redis outage during processing would silently and permanently lose a
deposit-processing message: no retry, no visibility, nothing. The consumer now runs in manual-ack
mode (`noAck: false`): `BitcoinManagerController` acks messages that are inherently unprocessable
(malformed payload, unknown type — retrying those can never succeed) and nacks with
`requeue: true` on genuine processing failures, so an infra blip gets redelivered instead of
vanishing.

Known gap, called out rather than hidden: requeueing is currently unbounded. A message that
fails deterministically (a real bug, not a transient outage) will loop forever instead of
landing in a dead-letter queue. A complete solution needs a dead-letter exchange or a
redelivery-count cap — a larger feature than this project currently implements.

### Graceful shutdown

`main.ts` registers `SIGTERM`/`SIGINT` handlers that close the raw Redis client and call
`app.close()` (which runs `MessagingService.onModuleDestroy()` to close the RabbitMQ client)
before exiting, instead of the process dying mid-connection on every container stop/restart.

### Repositories vs. raw SQL — a deliberate split, not a shortcut

`UtxoDatabaseService` mixes TypeORM repositories/`QueryBuilder` and raw SQL on purpose, not by
inconsistency:

- `getSmallestAndLargestDeposit` / `getCountAndTotalSumFromUnknownAddresses` are plain reads, so
  they go through `customerUtxosRepository`/`unknownUtxosRepository` via `QueryBuilder`.
- `insertUTXOs`/`removeUTXOs` need a manually-controlled transaction (for the deadlock-retry loop
  above), so they use `queryRunner.manager` directly. `removeUTXOs` specifically uses raw SQL
  (`UNNEST`) for the bulk delete because TypeORM's `Repository.delete()` only accepts a single
  `FindOptionsWhere`, not an array of exact composite-key tuples — the closest repository-native
  alternative (`In()` per field) would match the cross-product of the arrays instead of the exact
  pairs, risking deletion of unrelated, still-valid UTXOs.

### Indexing matches actual (and anticipated) access patterns

Every current query was checked against the existing indexes rather than assumed:

- `customerUtxo`/`unknownUtxo` writes and deletes always key off `(txHash, vout)`, the primary
  key.
- `customerUtxo`'s `(userAddress, transactionStatus)` composite index is exercised by the
  balance-recompute triggers (`AFTER INSERT` and `AFTER DELETE`): the `SUM(txValue)` query
  filters on both columns, and the `COUNT(*)` query filters on `userAddress`, the composite's
  leading column, so it benefits too.
- `getSmallestAndLargestDeposit`/`getCountAndTotalSumFromUnknownAddresses` run `MIN`/`MAX`/
  `COUNT`/`SUM(txValue)` with **no** `WHERE` clause, on every summary read. Migration
  `AddTxValueIndexes` adds a plain B-tree index on `txValue` for both tables so `MIN`/`MAX`
  resolve via an index scan (touching ~1 row) instead of a full table scan once these tables
  hold real volume, and `COUNT`/`SUM` can run as index-only scans.

`unknownUtxo`'s `@Index(['transactionStatus'])` is **not** exercised by anything in this
codebase today — no query filters `unknownUtxo` by status. It's kept anyway, deliberately: in a
running production system this table's rows would very likely need to be looked up by status
(e.g. `WHERE transactionStatus = 'UNCONFIRMED'`) to answer "what's the current status of a
deposit?".

### Self-sufficient Docker packaging

`docker-compose.yml`'s `app` service sets `DB_*`/`REDIS_*`/`RABBITMQ_*` directly under
`environment:` (mirroring how `db`/`rabbitmq` already hardcode their own dev credentials), with
`env_file: .env` marked `required: false`. This means `docker-compose up` works standalone even
though `.env` is, correctly, never committed — committing `.env` would violate standard practice,
but `docker-compose up` should work with zero setup steps. This satisfies both instead of trading
one off against the other. A committed `.env.example` documents the same fields for anyone
running outside Docker.

## Known limitations / intentionally out of scope

- Treatment of wallet conflicts (`walletconflicts` is logged, not acted on).
- DB deadlock handling is limited to a bounded retry on Postgres error `40P01`; broader
  procedure/lock-contention design is out of scope.
- No explicit DB isolation configuration to avoid reading concurrently with in-flight
  writes/procedures.
- Amounts are stored as Postgres `bigint` scaled to satoshis; this comfortably covers the real
  supply ceiling (max ~2,100,000,000,000,000 satoshis vs. `bigint`'s ~9.2 \* 10^18), so
  `number`/`parseInt` arithmetic in the JS layer is safe for realistic values without needing
  arbitrary-precision types.
- RabbitMQ is used as an internal job queue rather than switching to a fully event-driven
  architecture.
- Redis cache TTLs are rough estimates (`CACHE_TTL=900`s), not tuned against real session data.

## Running it

```
docker-compose up
```

This builds the app image, runs pending migrations (which also seed the known customer
addresses), then starts the app, which processes both fixture files and prints the 10-line
summary.

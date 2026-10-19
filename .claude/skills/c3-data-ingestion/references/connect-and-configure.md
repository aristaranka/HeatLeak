# Connect and Configure a Source

> ⚠️ **Always recommend Studio → Data Fusion first for any new connection or credential change.** Do not ask the user for credentials or connection details (host, account, key, bucket path) before directing them there to enter and test it. Offer a user-run console snippet only if they say Studio is unavailable or prefer code. (Selecting *which* dataset/table to configure is a separate, agent-authored step — see below.)

Covers connecting an external system, testing reachability, setting credentials, and configuring a dataset as a SourceCollection. Keep these outcomes distinct — "use Data Fusion" does not mean all of them.

## Connect an external source

1. Check for an existing SourceSystem before creating one: `SourceSystem.forName(name)` / `FileSourceSystem.forName(name)` / `SqlSourceSystem.forName(name)`.
2. For a new connection, prefer **C3 AI Studio → Data Fusion → + Add Data Source** for credential entry and testing (see [Credentials](#credentials)). This keeps secrets out of the chat.
3. After the user confirms the connection works, resume agent-authored work: dataset configuration, Source type, Transform, validation.

## <a id="credentials"></a>Credentials

**Never request, print, or execute a secret.** This includes **never asking the user to type or paste a secret value into the chat** — not even as a convenience or fallback, and not even with a "not recommended" caveat. If you catch yourself about to write "what is the password" or "you can paste it here," stop: the secret goes into the snippet the user runs in their own console (with a placeholder you never see), or into the Studio UI.

**Opening move for a credential change — decline the secret and point to Studio first.** If the user reports a changed/expired credential (or offers to paste one), open with, e.g.: *"Don't paste it here — update the credential in **C3 AI Studio → Data Fusion** and **Test** it; once it's green, tell me and I'll verify reachability, then recover the failed syncs."* Then follow path A for the mechanics. The order is **credential update → ping → recover**.

Two acceptable paths, in order of preference:

**A. Studio (recommended — lead with this, especially for a credential change/rotation).** For a **new** connection: in **C3 AI Studio → Data Fusion**, click **+ Add Data Source**, pick the connector (e.g. Delta Lake for Databricks, Snowflake, Postgres, S3, Kafka…), enter credentials, and **Test**. For a **rotation**: open the existing data source in Data Fusion and update its credentials. Don't prescribe a "Configure" click — that entry point is specific to C3 Code; **"Data Fusion → + Add Data Source"** is the portable instruction. Then ask them to confirm the SourceSystem name and that the test passed. Resume from there. For "the password/credential changed and the source stopped loading," present the Studio path first; only offer the console snippet (B) as a secondary option if they prefer code. After the connection is confirmed reachable (a passing ping), retry failed syncs with `BatchQueue.recoverFailed()` — recovery comes after reachability is verified, not before.

**B. Snippet the user runs themselves (fallback — only if they have a way to run C3 code).** When the user prefers code, give them a snippet to run in whatever C3-code surface they have (Static Console, Jupyter, or their app's server-side code). State explicitly that they run it — never offer to run it, and never end with "shall I execute this?". If the environment has no such surface (e.g. c3 code / Genesis has no console), do not offer this fallback — use the Studio path (A), which needs no console.

SQL source system (user runs this):

```python
source = c3.SqlSourceSystem.forName("my_source") or c3.SqlSourceSystem.make({"name": "my_source"}).upsert()
creds = c3.JdbcCredentials.fromServerEndpoint(
    "HOST_OR_ACCOUNT",           # host, or account for Snowflake
    -1,                          # port; -1 = default
    c3.DatastoreType.POSTGRES,   # see table below
    "DATABASE",
    "SCHEMA",                    # "" for MySQL
    "USERNAME",
    "PASSWORD",
)
# Snowflake: creds = creds.withField("properties", {"warehouse": "WH"})
# Databricks: creds = creds.withField("properties", {"httpPath": "/sql/1.0/..."})
source.setCredentials(creds, False)   # 2nd arg = merge; False replaces existing
print("Connected!" if source.ping().reachable else source.ping().errorMsg)
```

`fromServerEndpoint` takes **7 positional args including `schemaName`**. `setCredentials(creds, merge)` — `merge=false` replaces, `true` merges with existing.

File source system credentials (user runs the provider-appropriate snippet): see [provider credential snippets](#provider-credential-snippets).

### Required fields by database

These are the **common connectors and their non-obvious quirks — not the full supported set.** C3 supports ~150 JDBC/CData datastores; do not tell a user a database is unsupported because it's absent here — [discover the authoritative list](#discovering-connectors-and-credential-fields). Prompt for any missing required field before generating a snippet.

| Database | Required | Non-obvious quirk |
| --- | --- | --- |
| Snowflake | account, warehouse, database, schema, username, password | `warehouse` goes in `properties`; `role` optional |
| PostgreSQL | host, database, username, password | port 5432, schema `public` |
| MySQL | host, database, username, password | port 3306; schema **must be `""`** |
| SQL Server | host, database, username, password | port 1433, schema `dbo` |
| Redshift | host, database, username, password | port 5439, schema `public` |
| Databricks | host, httpPath, catalog, schema, token | username `"token"`; token as password; `httpPath` in `properties` |
| Oracle | host, serviceName, username, password | port 1521; enum value is `ORACLESE` |

`DatastoreType` (deprecated in favor of `Jdbc.DatastoreKind`, final 9.1, still valid) is an enum of ~150 values — the traditional databases above plus CData connectors like `JIRA`, `HUBSPOT`, `SALESFORCE`, `MONGODB`, `BIGQUERY`, `DYNAMODB`, and many more. Confirm the exact enum value from the live type rather than guessing.

### <a id="discovering-connectors-and-credential-fields"></a>Discovering connectors and credential fields

This skill lists only the common cases. This environment has read access to the platform types — use them as the authoritative source for the full connector list and any credential family:

- **All JDBC/CData datastore values:** read the `Jdbc.DatastoreKind` enum (`C3.type('Jdbc.DatastoreKind').meta()` / open `Jdbc.DatastoreKind.c3typ`).
- **Which credential type a source system takes:** every `SourceSystem<Config, CREDS>` is generic over its credential type — inspect the concrete system's `CREDS` and its `setCredentials`/`credentials` signatures. `SqlSourceSystem` → `JdbcCredentials`; `FileSourceSystem`, `CloudMessageSourceSystem`, `DataLakeSourceSystem` → `CloudCredentials` (abstract; open its subtypes for provider-specific fields — GCP/AWS/Azure and more).
- **Credential fields for a provider:** open the credential type (`GcpCredentials`, `AwsCredentials`, `AzureCredentials`, `JdbcCredentials`, …) and read its fields; don't infer field names from the examples below.

## Test reachability

`ping()` returns `{ reachable, errorMsg, url, roundtripNanos }`. It is read-only — run it directly, don't ask permission. Ping location depends on the concrete type:

```javascript
var sc = SourceCollection.forName('COLLECTION_NAME');
var reachable = sc.type().name() == 'CloudMessageSourceCollection'
  ? sc.ping()                 // CloudMessage: collection-level ping
  : sc.sourceSystem.ping();   // File / SQL: ping the source system
reachable;
```

Reachability proves only the current connection — not schema, per-dataset permissions, future credential validity, or that ingestion will succeed.

## Configure a dataset as a SourceCollection

Required inputs: environment/app, an existing reachable SourceSystem, the selected table/path/topic/API result, a stable collection name, structured-vs-unstructured intent, and the Source/parser contract.

Author the package artifacts (don't send the user back to Studio for this):

1. Inspect the concrete SourceCollection type and an existing package example for its connector-specific fields.
2. Define the transient Source type under `src/source/` (see [Source type authoring](#source-type-authoring)).
3. Add the SourceCollection metadata under `metadata/<ConcreteSourceCollection>/`, referencing the SourceSystem, the selected dataset, and the Source type.
4. Add a Transform when the Source doesn't already match the target — see [inspect-and-transform](inspect-and-transform.md#author-a-transform).
5. Validate package metadata before executing — see [inspect-and-transform](inspect-and-transform.md#validate-a-draft-before-applying).

Concrete linking fields (verify against the deployed type — some are subtype-specific):

- **All collections** inherit `sourceSystem` and `source` (the Source type) from `SourceCollection`.
- **SqlSourceCollection** — `sourceSystem: !SqlSourceSystem`, and `declaredSchemaName` (string) for the qualified external table; when omitted, the `tableName()` member infers the physical table from the collection `name`/`source`. Example: `SqlSourceCollection.make({ name: 'Orders', sourceSystem: 'snowflake_orders', source: 'SourceOrder', declaredSchemaName: 'ORDERS' }).upsert()`. (Verify the field on your deployed type — it is `declaredSchemaName`, not `schemaName`.)
- **FileSourceCollection** — `sourceSystem: !FileSourceSystem`; files are read from `inboxUrl()`. See [load a local file](#load-a-local-file).
- **CloudMessageSourceCollection** — broker identity lives in its `Config` (broker type/name), registered with `register()`; it is not linked through a `sourceSystem` table like SQL/File. Inspect the deployed `CloudMessageSourceCollection.Config` and an existing broker example for the exact broker/credential fields before authoring.

If unsure of an exact field on a concrete collection, inspect the deployed type and an existing package example before writing the metadata — don't invent field names.

Verify the collection references the intended SourceSystem, dataset, and Source type. **Configuration is not a load** — do not report it as one.

## <a id="load-a-local-file"></a>Load a local file (FileSourceCollection end to end)

**The whole assembled pipeline at a glance** — a file-source pipeline is these 4 artifacts, wired by name. Use this as the template; you rarely need to inspect the base platform types to assemble it.

```
<pkg>/
├── src/source/SourceOrder.c3typ                 # transient Source type (one field per column)
├── src/Order.c3typ                              # target entity type (your domain owner defines this)
├── metadata/FileSourceSystem/OrdersFileSystem.json     # the connection (credentials set via Studio)
├── metadata/FileSourceCollection/OrdersFeed.json       # the dataset: links sourceSystem + source
└── metadata/Transform/SourceOrder-Order.js      # maps Source -> target (name == filename)
```

```json
// metadata/FileSourceSystem/OrdersFileSystem.json  — the connection
{ "name": "OrdersFileSystem" }
```
```json
// metadata/FileSourceCollection/OrdersFeed.json  — the dataset, linked by name
{ "name": "OrdersFeed", "sourceSystem": "OrdersFileSystem", "source": "SourceOrder" }
```
```c3typ
// src/source/SourceOrder.c3typ  — authored from inferSourceType output; @ser maps awkward or reserved-keyword names
type SourceOrder mixes Source { @ser(name="Order ID") orderId: string  amount: double }
```
```javascript
// metadata/Transform/SourceOrder-Order.js  — name MUST equal the filename
data = { name: 'SourceOrder-Order', source: 'SourceOrder', target: 'Order',
         projection: { id: orderId, amount: amount } };
```

Then: (credentials via Studio if it's a cloud bucket, rule 3) → drop the file in `inboxUrl()` → **author the Source type from the file's columns** → `SourceCollection.forName('OrdersFeed').process(...)` → verify (see [execute-and-schedule](execute-and-schedule.md)). Full walkthrough below.

### File pipeline step by step

A `FileSourceCollection` reads from an inbox owned by a `FileSourceSystem`; create the system first. **Author the Source type from the dropped file's columns** — `inferSourceType()` reads the file server-side and returns the schema (CSV/JSON/Avro/Parquet). For a spreadsheet (`.xlsx`), convert it to CSV first and load the CSV, then infer from that.

```javascript
// 1. Source system (local/managed needs no credentials; cloud buckets set them per Credentials above)
FileSourceSystem.make({ name: 'OrdersFileSystem' }).upsert();

// 2. Collection linked to the system — `source` is added in step 6, after you author it
FileSourceCollection.make({ name: 'OrdersFeed', sourceSystem: 'OrdersFileSystem' }).upsert();

// 3. Get the inbox URL, then upload the file into it (mechanism in "Getting the file into the inbox" below).
//    For a spreadsheet, upload its CSV conversion.
var fsc = FileSourceCollection.forName('OrdersFeed');
var inboxUrl = fsc.inboxUrl();   // a FileSystem URL on a managed store (e.g. S3)

// 4. Infer the schema from the file in the inbox (returns the columns to author from):
fsc.inferSourceType();   // JSON schema; inferSourceType2(InferTypeSpec) returns typed TypeMeta
```
```c3typ
// 5. Author src/source/SourceOrder.c3typ from those columns:
type SourceOrder mixes Source {
  @ser(name="Order ID") orderId: string   // @ser maps headers that are awkward or reserved keywords
  amount: double
}
```
```javascript
// 6. Link the deployed Source type — set `sourceSystem` and `source` together in one make() so both hold:
FileSourceCollection.make({ name: 'OrdersFeed', sourceSystem: 'OrdersFileSystem', source: 'SourceOrder' }).upsert();

// 7. Add metadata/Transform/SourceOrder-Order.js (name MUST equal the filename), then load + verify:
FileSourceCollection.forName('OrdersFeed').process(DataIntegSpec.make({ process: true }));
```

The `source` link is required to create statuses — a collection with `source == null` produces no `SourceStatus` and is the top file-load failure mode ([diagnose-and-recover](diagnose-and-recover.md)). Load and verification detail: [execute-and-schedule](execute-and-schedule.md).

**Getting the file into the inbox.** `inboxUrl()` is a FileSystem URL on a managed store (e.g. S3), not a local path. Upload a local file with a **presigned URL + `curl`** — no local cloud credentials, no marshaling file contents through code — and **stamp the file's content type on the PUT** (the DI parser selects the parser from the file's stored content type). `ContentType.guessContentType(name, MediaType.OCTET_STREAM, null)` resolves the right C3 type from the extension for any supported format — the same value a Studio → Data Fusion upload sets:

```javascript
// runJsCode — presigned PUT URL + the file's C3 content type (by extension, any format):
var name = 'orders.parquet';
FileSystem.generatePresignedUrl(inboxUrl + name, 'PUT', '1h');     // -> presigned URL
ContentType.guessContentType(name, MediaType.OCTET_STREAM, null);  // -> e.g. application/vnd.apache.parquet+binary
```
```bash
# shell — upload the bytes, stamping that content type so the file parses:
curl -X PUT -H "Content-Type: <content type from guessContentType>" --data-binary @/path/to/orders.parquet "<presigned-url>"
```

Works on every cluster blob backend — **S3, GCS, Azure Blob** (Azure Blob PUT also needs `-H 'x-ms-blob-type: BlockBlob'`). Alternatives: a **Studio → Data Fusion** upload (no code — sets the content type for you); pass `contentTypeOverride: ContentType.guessContentType(name, MediaType.OCTET_STREAM, null)` to `process(...)` instead of the header; or, for small text, `FileSystem.makeFile(inboxUrl + name).writeString(content)`.

**A newly authored type is available only once it compiles.** Deploying a new Source or target type triggers a sync/compile step, so it may not resolve in the running app immediately. If a type you just authored is not yet found when you link or `process()`, confirm with `readPkgIssues` and wait for it to compile rather than assuming it failed.

### Same shape, other connectors — only the collection metadata differs

The file tree, Source type, Transform, and name-linking are identical for SQL and cloud-message pipelines. Only the SourceCollection's metadata (and one Source-type detail) change:

| | Collection metadata `metadata/<ConcreteType>/*.json` | Source-type declaration | Notes |
| --- | --- | --- | --- |
| **File** | `{ name, sourceSystem: <FileSourceSystem>, source }` | `type Src mixes Source`, columns via `@ser(name="Col Name")` | reads from `inboxUrl()` |
| **SQL** | `{ name, sourceSystem: <SqlSourceSystem>, source, declaredSchemaName? }` | **`entity type Src mixes External, NoSystemCols, Source`**, columns via `schema name 'COL'` | The `entity type` + `External`/`NoSystemCols` mixins are **required** — a plain `type` throws a `method.overloads()` NPE at load. Needs `cdcOrder` **or** `fullSync=true`. See [Ingest a SQL table](#ingest-a-sql-table-databricks-snowflake-postgres) below. |
| **CloudMessage** | `{ name, source, cloudMessageBrokerName, cloudMessageBrokerType }` (+ `external: true`, optional `batchSize`) | `type Src mixes Source`, fields via `@ser(...)` | no `sourceSystem` table; broker set via those two Config fields; call `register()` to start receiving. `cloudMessageBrokerType` is a type name, e.g. `ApacheKafkaTopic` |

File/cloud-message pipelines share the same simple shape (Transform `name`==filename, `process(...)`, verification). **SQL is different enough to warrant its own walkthrough** — see below.

## <a id="ingest-a-sql-table-databricks-snowflake-postgres"></a>Ingest a SQL table (Databricks, Snowflake, Postgres…)

A SQL source type is **not** a plain `Source` type — it is an **`entity type` that mixes `External, NoSystemCols, Source`**, with one field per external column mapped by `schema name`. That single type does double duty:

- **Virtual reads immediately** (all versions) — `SourceOrder.fetch()` / `readObjs()` push the query to the external DB and return live rows, no copy (data virtualization). Always author this type; it's your inspection surface *and* the pipeline source.
- **Managed ingestion** (**8.9+**) — the same type feeds a `SqlSourceCollection` → `Transform` → target entity via `process()`. **Not available on 8.8**: `SqlSourceCollection` has no `process()` there, so SQL is read-only — use virtual reads and, if you must persist, upsert app-side (`SourceOrder.fetch()` → `Target.upsertBatch(...)`). See the [SQL version gate](execute-and-schedule.md#sql-ingestion-full-load-and-incremental-cdc).

Why the mixins (each is required, not optional):
- **`entity type`** (Persistable) — the SQL read path does `Persistable.downcast(source())`; a plain `type` isn't Persistable and throws `NullPointerException: Cannot invoke "method.overloads()"`. This is the #1 SQL setup trap.
- **`External`** — marks the type as living in the external DB, so C3 doesn't try to create/manage its table and routes `fetch()` to the source.
- **`NoSystemCols`** — drops C3's system/managed columns; without it an `entity type` generates its own names (`MANUFACTURER_S`, `POWER_I`, an `ID` column) instead of your real external columns.

**"I don't know which table" / "show me the tables" — list them.** The connection and credentials come from Studio → Data Fusion first (rule 3); you do **not** ask for a host or token in chat to browse. Once the `SqlSourceSystem` is reachable, enumerate tables through its JDBC connection:

```javascript
var jdbc = SqlSourceSystem.forName('OrdersDb').connect();   // -> Jdbc
jdbc.listTableNames();                                       // -> { names, qualifiedNames, namesBySchema, hasMore }
// bounded: jdbc.listTableNames(JdbcListTableNamesSpec.make({ limit: 100, offset: 0 }))
```

`listTableNames()` is the table-enumeration API — reach for it directly rather than probing `previewTable('')`, `information_schema`, `inferSourceTypes([])`, or `Object.keys(...)` (none of those list tables). Read `.qualifiedNames` for schema-qualified names (e.g. `default.orders`) or `.namesBySchema` grouped by schema.

**Then discover the chosen table's columns** (so you map real column names, not guesses):

```javascript
SqlSourceSystem.forName('OrdersDb').previewTable('default.orders', 10);   // columns + sample rows (@beta)
// or, once a collection exists: SqlSourceCollection.forName('OrdersSql').connect().columns
```

`SqlSourceSystem.inferSourceTypes([coll])` can also generate the source `TypeMeta` for you to review. Use the discovered column names/types to write the `schema name` mappings below.

The 5 artifacts:

```c3typ
// src/source/SourceOrder.c3typ — external columns mapped verbatim by `schema name`
entity type SourceOrder mixes External, NoSystemCols, Source schema name 'default.orders' {
  id: string schema name 'ORDER_ID'
  amount: double schema name 'AMOUNT'
  updatedAt: datetime no tz schema name 'UPDATED_AT'   // an ordering column, if one exists
}
```
```c3typ
// src/Order.c3typ — plain target entity (C3-managed)
entity type Order schema name 'ORDER' { amount: double  updatedAt: datetime }
```
```json
// metadata/SqlSourceSystem/OrdersDb.json — connection; credentials entered in Studio (rule 3)
{ "name": "OrdersDb" }
```
```json
// metadata/SqlSourceCollection/OrdersSql.json — links source type + system
{ "name": "OrdersSql", "source": "SourceOrder", "sourceSystem": { "type": "SqlSourceSystem", "name": "OrdersDb" } }
```
```javascript
// metadata/Transform/SourceOrder-Order.js — name MUST equal the filename
data = { name: 'SourceOrder-Order', source: 'SourceOrder', target: 'Order',
         projection: { id: id, amount: amount, updatedAt: updatedAt } };
```

**Physical table — declare it once.** The source type's `schema name` is fully qualified (`'default.orders'`) and becomes the authoritative `rootTableName`. Leave `declaredSchemaName` off the collection (as above), or set it to the identical qualified string — the type's `schema name` takes precedence over `declaredSchemaName`, so keeping them equal makes the binding unambiguous.

**Numeric columns you aggregate → `double`.** Map a column you'll `avg`/`sum` as `double` even when its stored values look integral — an `avg` over an `int`-typed external field returns a decimal that can trip `Error parsing long value [49.3]`.

Then set credentials in Studio, and run:

```javascript
// One-time full load of a small table with no reliable ordering column (fullSync is 8.11+):
SqlSourceCollection.forName('OrdersSql').config().setConfigValue('fullSync', true, ConfigOverride.APP);  // + maxFullSyncRowCount if >100k rows
SqlSourceCollection.forName('OrdersSql').process(DataIntegSpec.make({ process: true }));

// Incremental (has a monotonically increasing column): set cdcOrder instead of fullSync
// (collection metadata) "cdcOrder": "updatedAt, id"  — see execute-and-schedule.md
```

> **Version note (the `process()`/`fullSync` block above is 8.11+):**
> - **8.8:** no SQL `process()` and no CDC at all — the block above does not run. SQL is read-only: use the virtual reads above (and app-side upsert if you must persist).
> - **8.9–8.10:** no `fullSync`; SQL CDC requires **staged mode** (`stage=true` + a staging `FileSourceCollection`) with a non-empty `cdcOrder`; a `stage=false` collection is rejected.
>
> See [execute-and-schedule → SQL version gate](execute-and-schedule.md#sql-ingestion-full-load-and-incremental-cdc).

Choosing the run mode and the gotchas (staging, quoting, cdcOrder) are covered in [execute-and-schedule → SQL](execute-and-schedule.md#sql-ingestion-full-load-and-incremental-cdc). To just look at the data without ingesting, `SourceOrder.fetch({ limit: 10 })` is enough.

## <a id="source-type-authoring"></a>Source type authoring

Source types are transient (`mixes Source`), one field per source column, under `src/source/`.

```c3typ
type SourceOrder mixes Source {
  @ser(name="Order ID")            // file/message column name mapping
  orderId: string
  unitPrice: double
  productType: string schema name 'PRODUCT_TYPE'   // SQL column name mapping
}
```

- **File / cloud-message sources** → map awkward column names with `@ser(name="...")` (spaces, special chars, reserved words like `type`, dots).
- **SQL sources** → map database column names with `schema name '...'`.

Use a **Canonical type** (`mixes Canonical<T>`, under `src/canonical/`) only when one source feeds several targets or a multi-step Source → Canonical → Target chain is genuinely reused. Domain-entity/target design is a backend/type-owner decision — hand it off if the target model is unsettled ([boundaries-and-handoffs](boundaries-and-handoffs.md#handoffs)).

## <a id="provider-credential-snippets"></a>Provider credential snippets (user runs these)

Give the user the snippet for their provider; they paste it into their own console. Placeholders in `<>`. These cover the **common file-source providers — not every credential family**; for anything else, [discover the credential type and its fields](#discovering-connectors-and-credential-fields) from the live types.

```javascript
// GCS — fields map to the GCP service-account key: accountEmail=client_email,
// accessKey=private_key_id, secretKey=private_key
FileSourceSystem.forName('SYSTEM').setCredentials(GcpCredentials.make({
  accountId: '<project-id>', accountEmail: '<sa@project.iam.gserviceaccount.com>',
  accessKey: '<private-key-id>',
  secretKey: '<-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n>' }));

// AWS S3 — IAM role
FileSourceSystem.forName('SYSTEM').setCredentials(AwsCredentials.make({
  cloudIdentity: '<arn:aws:iam::acct:role/name>', region: '<us-east-1>' }));

// AWS S3 — access key
FileSourceSystem.forName('SYSTEM').setCredentials(AwsCredentials.make({
  accessKey: '<key>', secretKey: '<secret>', region: '<us-east-1>' }));

// Azure Storage — access key (also supports sasToken, or Service Principal tenantId/clientId/clientSecret)
FileSourceSystem.forName('SYSTEM').setCredentials(AzureCredentials.make({
  storageCredentials: AzureStorageCredentials.make({ accountName: '<acct>', accessKey: '<key>' }) }));
```

After credentials are set, the user runs `FileSourceSystem.forName('SYSTEM').ping()` to confirm, then retries any failed sync with `BatchQueue.recoverFailed()`.

## Stop and clarify

When the dataset, target semantics, identity, parser contract, credentials, or environment is ambiguous. Hand unstructured documents to `c3-unstructured-data-integration`; hand unsettled domain-model design to the backend/type owner.

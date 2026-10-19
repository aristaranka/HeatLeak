# Inspect Data and Author Transforms

Covers previewing source data, inferring/validating a Source type, authoring a Transform, and previewing transformed output. Reads are non-mutating — run them directly; don't ask permission. None of these persists anything.

Identify the concrete type first (`sc.type().name()`); the read API varies by subtype.

## Preview source data

```javascript
var sc = SourceCollection.forName('COLLECTION_NAME');

// File / SQL / Api / DataLake: readObjs returns stream<Obj>
sc.readObjs(ObjsOperSpec.make({ offset: 0, limit: 10 })).collect();
// File/SQL also support: sc.readObjs().first(5).collect()
```

Subtype notes (grounded in the deployed platform):

- **FileSourceCollection** — also read a specific file: `FileSystem.listFiles(fsc.inboxUrl()).files[0].readFirstLine()` (check CSV header) or `.readString(0, 3000)` (raw sample).
- **SqlSourceCollection** — to **list available tables** (user doesn't know the table): `SqlSourceSystem.forName(name).connect().listTableNames()` → `{ names, qualifiedNames, namesBySchema, hasMore }` (do not probe `information_schema`/`previewTable('')`/`inferSourceTypes([])`). For one table: `ssc.connect()` returns the resolved `SqlTable` (schema — present schema then rows); `SqlSourceSystem.forName(name).previewTable(table, 10)` is a `@beta` quick preview. **`readTuples()` is NOT implemented for SQL** (throws `notImplemented`) — use `readObjs`, not `readTuples`, for SQL.
- **CloudMessageSourceCollection** — `.first(N)` is unsupported; you must pass a limit: `cmsc.readObjs(ObjsOperSpec.make({ limit: 5 })).collect()`. Reading can **consume** messages. Only preview when the broker is a CloudStream: `C3.type(cmsc.cloudMessageBrokerType).meta().isA(CloudStream)`; otherwise warn that previewing removes messages from the queue.
- **`readTuples()`** is implemented for File, CloudMessage, Api, DataLake — but **not** SQL or Content.

Temporary inbox override for one FileSourceCollection (does not affect others):

```javascript
fsc.config().withInboxUrlOverride('gcs://bucket/path/inbox/').setConfig();
fsc.inboxUrl(); // verify
```

Don't change the shared SourceSystem root URL to affect a single collection.

## Infer a Source type

```javascript
var fsc = FileSourceCollection.forName('COLLECTION_NAME');
fsc.inferSourceType();                              // returns JSON schema; convenient
fsc.inferSourceType2(InferTypeSpec.make({}));       // returns typed TypeMeta; canonical
```

`inferSourceType()` is a thin wrapper over `inferSourceType2()`; both are valid. Review the result, then create `src/source/Source<Entity>.c3typ` (see [connect-and-configure](connect-and-configure.md#source-type-authoring)). Inference is JSON-only for CloudMessage and unimplemented for Content.

## Validate source-schema conformance

```javascript
sc.validateSourceData(ValidateSourceDataSpec.make({ persist: false }));
```

Reports missing/extra/drifted fields by severity against the declared Source type. Keep `persist: false` unless the user explicitly wants issues recorded. Detection only — automatic repair and correction of already-loaded data are separate work ([diagnose-and-recover](diagnose-and-recover.md)). Do not modify the Source type, collection, transforms, or targets here.

## <a id="author-a-transform"></a>Author a Transform

Required first: complete Source and target type definitions, and the approved field mappings. **Do not fabricate types or fields** — if a definition is missing, ask for it.

1. Create `metadata/Transform/<Source>-<Target>.js`. The top-level variable must be `data` (not `var data`, not `Transform.make`). `name` must equal the filename without `.js`. (In a `.js` transform, expressions are written **bare**, as below. A `.json` transform instead quotes every expression as a string — `"concat(a, '_', b)"`, `"amount > 0"`. Prefer `.js`.)
2. Prefer **`projection`** — declarative, validated at compile time.
3. Add `condition` only for approved filtering (applied before projection).
4. Use **`transformer`** only when imperative logic (loops, one-to-many, branching beyond a ternary) is genuinely required.
5. Reference source fields by name directly (no `srcObj.` in projections). FK references use nested `{ id: ... }`.

In a projection, a field reference is a **bare identifier** — `amount`, not `'amount'` (a quoted string is a string *literal*, not a field ref) and not `` `amount` `` (backticks are for SQL `schema name` only; they throw `Unsupported operation` in the expression engine). Do **not** use `this.field` either — bare names are the platform idiom. Build a composite id with `concat`: `id: concat(sensorTag, '_', string(epochMillis))` (positional args and a single array both concatenate to a string; `string(x)` casts a number cleanly — a bare number renders as `1700.0`). If an editor/formatter keeps re-quoting expressions in your `.js`, confirm what actually persisted with `Transform.forName('<name>').projection` rather than trusting the file on disk.

Projection (preferred):

```javascript
data = {
  name: 'SourceOrder-OrderSummary',
  source: 'SourceOrder',
  target: 'OrderSummary',
  condition: orderQuantity > 0,          // optional
  projection: {
    id: orderId,
    customer: { id: customerId },        // FK reference
    totalValue: orderQuantity * unitPrice,
    orderTimestamp: orderDate,
  },
};
```

`condition` is a **bare expression, not a quoted string**: `condition: exists(amount) && amount > 0`.

Transformer — use for one-to-many, nested arrays, or logic projection can't express. It receives one source object and **returns an array** of targets (return several to fan out one row into many):

```javascript
// One source row carrying a JSON array of line items → one LineItem target each
data = {
  name: 'SourceOrder-LineItem',
  source: 'SourceOrder',            // has a field `lineItems: json`
  target: 'LineItem',
  transformer: function (srcObj) {
    var items = srcObj.lineItems || [];   // json array field arrives parsed; JSON.parse only if it's a string
    return items.map(function (item, i) {
      return LineItem.make({
        id: srcObj.orderId + '_' + i,
        order: { id: srcObj.orderId },     // FK reference
        sku: item.sku,
        quantity: item.quantity,
      });
    });
  },
};
```

A JSON/array source column is declared `lineItems: json` on the Source type. Inside a transformer you read fields with `srcObj.<field>` (unlike projections, which use bare names).

**Expression-engine functions** (projections/conditions) are the registered functions in the platform function library; packages may add their own (`extends ExpressionEngineFunction`). Common ones: `concat`, `string(x)` (cast to string — **not** `str`, which is not registered), `substring`, `replace`, `upperCase(s)`, `lowerCase`, `trim`, `exists`, `dateTime`, `md5`, `safeId`, ternary `?:`, arithmetic. `concat` concatenates its args into a string — both `concat(firstName, ' ', lastName)` and `concat([firstName, ' ', lastName])` work. Check both platform and package before telling the user a function doesn't exist.

## Preview transformed output (non-mutating)

Reuse already-previewed source objects; call `transformSource` on the Source **type**. Its result has **`.objs`** (array of targets) and **`.errors`** (a `map<int, Error>` keyed by record index — not an array):

```javascript
var sources = sc.readObjs(ObjsOperSpec.make({ limit: 10 })).collect();
var result = C3.type(sc.source).transformSource(sources, SourceTransformSpec.make({ doNotThrowError: true }));

var errKeys = result.errors.keys();
'Transformed ' + result.objs.length + ' objs; ' + errKeys.length + ' errors' +
  (errKeys.length ? ' — first: ' + result.errors.get(errKeys[0]) : '');
```

`sc.source` is the Source type name. Use `SourceTransformSpec` fields `doNotThrowError`, `targetType`, `withTargetDefaults` as needed. Transform authoring/preview never persists — persistence happens only through [execute-and-schedule](execute-and-schedule.md).

## <a id="validate-a-draft-before-applying"></a>Validate a draft before applying

Validate the complete draft without saving config, executing, or writing targets:

1. Validate SourceSystem/SourceCollection references, selected dataset, Source type, and parser/column mappings.
2. Validate CDC order/staging mappings if present.
3. Validate Transform selection, projection/condition expressions, deterministic identity, and required target fields.
4. Validate target create/update/staging semantics and the schedule.
5. Return actionable errors: the affected artifact, the invalid field/rule, and the required correction.

For a Studio draft, use the built-in graph/step validation without applying the node lifecycle mutation. For package artifacts, run package type/metadata validation and inspect package issues without calling `process(...)`. A clean result lets the user decide to apply — it does not prove connectivity, execution, or correct targets.

# Syncing and Processing Files

To ingest and process files in a collection, call `Genai.SourceCollection.Utils.sync` with `shouldProcess: true`.

This does two things in sequence:
1. **Sync** — discovers files at `rootUrl` and creates/updates `Genai.SourceFile` records
2. **Process** — calls `processUnprocessSourceFiles()` → `Genai.SourceFile.processWithPipeline()` on any files with status `NOT_INDEXED` or `NEEDS_REINDEXING`

```javascript
// Sync and process a specific collection
Genai.SourceCollection.Utils.sync(
  { filter: "id == 'my-collection'" },
  true  // shouldProcess
);

// Sync and process all collections
Genai.SourceCollection.Utils.sync({ limit: -1 }, true);
```

To sync without processing (register files only, no pipeline):

```javascript
Genai.SourceCollection.Utils.sync(
  { filter: "id == 'my-collection'" },
  false
);
```

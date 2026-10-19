---
name: c3-code-python-upgrade
description: |
  Migrate C3 AI applications from Python 3.9 to Python 3.12 and Pandas 1.3 to 2.2. Use when:
  (1) upgrading runtimes, runtime claims, or pipes from Python 3.9 to 3.12
  (2) migrating Pandas 1.x code to Pandas 2.2
  (3) updating MlPipes or MlPipelines to use _312 variants
  (4) switching Jupyter notebook kernels to Python 3.12
  (5) resolving deprecation or compatibility issues after the Platform 8.9 default Python change
  (6) the user mentions "python upgrade", "3.12 migration", "pandas upgrade", or "_312 runtimes"
core: false
category: platform
version: 8.9.0
minimumVersion: 8.9.0
---

# C3 AI Python 3.12 Upgrade Guide

Starting with C3 AI Platform **version 8.9**, the default Python version changes from **3.9 to 3.12**. This affects the JEP executor and the default JupyterLab image. Python 3.9 continues to run but reaches upstream end-of-life in October 2025.

## CRITICAL — File-by-File Code Migration

> **You MUST open and read every `.py` file in the package — not just grep for patterns.** Grep-based searches are a starting point but are unreliable: they miss multi-line expressions, aliased imports, dynamically constructed calls, and non-obvious usages. After completing the runtime and claim upgrades below, iterate over each `.py` file in `src/` and `test/`, **read the full file contents**, identify every deprecated call listed in the migration tables, and rewrite it to use the correct replacement API. Do not skip any file. Do not rely solely on grep output to determine whether a file needs changes — you must read the file to know for certain. The tables in the "Common Pandas 2.2 Migration Patterns", "C3 Data API Changes", and "Python Standard Library Changes" sections below define the exact signature transformations to apply.

### Mandatory API Signature Changes

Apply these transformations in every `.py` file:

| Deprecated Signature                                                  | Replacement                                                      | Notes                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `df.append(row)` / `series.append(other)`                             | `pd.concat([df, pd.DataFrame([row])])`                           | `DataFrame.append()` and `Series.append()` removed in Pandas 2.0 |
| `pd.Int64Index(...)` / `pd.UInt64Index(...)` / `pd.Float64Index(...)` | `pd.Index(..., dtype="int64")` (etc.)                            | Removed in Pandas 2.0                                            |
| `pd.date_range(..., closed=...)`                                      | `pd.date_range(..., inclusive=...)`                              | `closed` parameter renamed to `inclusive`                        |
| `df.fillna(val)` (relying on auto-downcast)                           | `df.fillna(val).infer_objects()`                                 | Auto-downcasting removed in Pandas 2.2                           |
| `df.replace(val)` (relying on auto-downcast)                          | `df.replace(val).infer_objects()`                                | Auto-downcasting removed in Pandas 2.2                           |
| `series.pct_change(fill_method=...)`                                  | Remove `fill_method` arg or use explicit `.fillna()` before call | `fill_method` deprecated in Pandas 2.0                           |
| `SomeType.eval(...).<pandas_op>`                                      | `SomeType.eval(...).to_pandas().<pandas_op>`                     | Must call `.to_pandas()` before any Pandas operations            |
| `c3.Data.from_pandas(df)`                                             | `c3.Data.Persisted.from_pandas(df)`                              | `Data.from_pandas()` removed                                     |
| `array.tostring()` / `array.fromstring()`                             | `array.tobytes()` / `array.frombytes()`                          | Removed in Python 3.9+                                           |
| `pathlib.Path.link_to(target)`                                        | `target.hardlink_to(path)`                                       | Removed in Python 3.12                                           |
| `import distutils`                                                    | `import setuptools`                                              | `distutils` removed in Python 3.12                               |
| `import imp`                                                          | `import importlib`                                               | `imp` removed in Python 3.12                                     |
| `import cgi`                                                          | Use `urllib.parse`, `email.message`, or `multipart`              | `cgi` deprecated, pending removal                                |
| `locale.getdefaultlocale()`                                           | `locale.getlocale()` or `locale.getencoding()`                   | Deprecated in Python 3.11                                        |

### Search Patterns for Finding Code to Migrate

> **These grep patterns are a starting point only.** They help identify obvious hits, but they do **not** replace reading each file. Grep misses multi-line calls, aliased imports (e.g. `import pandas as pd` followed by `pd.Int64Index` won't match `Int64Index` alone), and indirect usages. Always read the full file after grepping.

Run these searches against `src/` and `test/` to find all code requiring changes:

```bash
# Runtime claims to update (in .c3typ files)
grep -rn 'py-data\b' src/ test/ --include="*.c3typ" | grep -v '_312'
grep -rn 'py-sklearn\b' src/ test/ --include="*.c3typ" | grep -v '_312'
grep -rn 'py-tf\b' src/ test/ --include="*.c3typ" | grep -v '_312'
grep -rn 'py-matplotlib\b' src/ test/ --include="*.c3typ" | grep -v '_312'

# Deprecated Pandas APIs (in .py files)
grep -rn '\.append(' src/ test/ --include="*.py"
grep -rn 'Int64Index\|UInt64Index\|Float64Index' src/ test/ --include="*.py"
grep -rn 'fill_method\s*=' src/ test/ --include="*.py"
grep -rn 'closed\s*=.*date_range\|date_range.*closed\s*=' src/ test/ --include="*.py"

# Deprecated C3 Data APIs (in .py files)
grep -rn 'Data\.from_pandas' src/ test/ --include="*.py"
grep -rn '\.eval(.*)\.' src/ test/ --include="*.py" | grep -v 'to_pandas'

# Python stdlib deprecations (in .py files)
grep -rn '\.tostring()\|\.fromstring()' src/ test/ --include="*.py"
grep -rn '\.link_to(' src/ test/ --include="*.py"
grep -rn 'import distutils\|import imp\b\|import cgi\b' src/ test/ --include="*.py"
grep -rn 'locale\.getdefaultlocale' src/ test/ --include="*.py"
```

## Reference

| Reference                       | When to Load                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `references/migration-guide.md` | Full deprecation tables for Python 3.9→3.12, Pandas 1.3→2.2, Data API changes, and key library version mappings |

## What Changed

1. New Platform runtimes based on Python 3.12 follow the naming convention `<runtime>_312` (e.g. `py-data` → `py-data_312`).
2. Pandas upgraded from **1.3 → 2.2** in the new runtimes.
3. New Platform MlPipes use the `_312` runtimes (e.g. `SklearnPipe` → `SklearnPipe_312`).
4. A Platform migration tool can upgrade pipelines to `_312` pipe variants automatically.

## Upgrading Code to Python 3.12

### Step 1 — Inventory All Runtime Definitions and Claims

Before making any changes, build a complete list of every Python runtime in use. There are **two places** runtimes appear:

**A. `metadata/` — `ImplLanguage.Runtime` seed/metadata files**

These define custom runtimes (`ImplLanguage.Runtime`). Find them all:

```bash
grep -rl "ImplLanguage.Runtime\|\"type\": \"Runtime\"" metadata/
```

Each file defines a runtime by name (e.g. `py-prooptim`, `py-data-excel`). These are the runtimes the package owns and must upgrade.

**B. `src/` and `test/` — runtime claims in `.c3typ` files and runtime strings in `.py` files**

```bash
grep -roh ' py-[a-z0-9_-]*' src/ test/ --include="*.c3typ" | sort -u
grep -roh '"py-[a-z0-9_-]*"' src/ test/ --include="*.py" | sort -u
```

Collect every distinct runtime name from both sources before proceeding.

### Step 2 — Upgrade Custom Runtime Definitions in `metadata/`

For each `ImplLanguage.Runtime` file found in Step 1A, create a new `_312` variant file alongside the original. **Never modify or remove the original** — other packages may depend on it by name, and it is still needed for Python 3.9 opt-out.

The new file is a copy with two changes: `name` gets `_312` appended, `languageVersion` becomes `"3.12"`, and each parent is updated to its own `_312` variant:

```json
// Original: py-my-custom.json
{ "name": "py-my-custom", "languageVersion": "3.9", "parents": ["py-data"] }

// New: py-my-custom_312.json
{ "name": "py-my-custom_312", "languageVersion": "3.12", "parents": ["py-data_312"] }
```

### Step 3 — Resolve Custom Runtimes

After creating the new `_312` runtime definition files, use the AppMCP `runJs` tool to resolve and register them with the platform:

```javascript
ImplLanguage.py().upsertPkgRuntimes();
```

This will resolve the new runtimes and generate the necessary engine variants (e.g. `-server-py4j`, `-client-ipython`, `-server-py4j-test`) for each.

### Step 4 — Update Runtime Claims in .c3typ Files

Apply the resolution table from Step 2. Change runtime claims in `src/` and `test/`:

```c3typ
// Before
myAction: function(): string py-data

// After
myAction: function(): string py-data_312
```

**Important:** The bare `py` claim now executes in Python 3.12 by default. Do not change bare `py` claims.

### Step 5 — Update Runtime String References in .py Files

Some `.py` files pass runtime names as strings (e.g. `actionRequirement="py-prooptim"`). Apply the same resolution table to these.

### Step 6 — Migrate Python Code File by File

> **This step is critical.** Iterate through every `.py` file in `src/` and `test/`. For each file, **read the full file contents** and apply every applicable API signature change from the "Mandatory API Signature Changes" table above. Do not rely on grep alone — grep misses multi-line expressions, aliased imports, and indirect usages. You must read each file to catch all issues. Do not skip files.

**Use parallel agents to maximize speed.** Partition the list of `.py` files into batches and launch multiple agents concurrently (up to 4 at a time), each responsible for migrating its batch. Every agent receives the full "Mandatory API Signature Changes" table and "Search Patterns" list so it can work independently. This turns a serial file-by-file walk into a fast parallel operation.

The agent must:

1. List all `.py` files in `src/` and `test/`.
2. Partition the files into batches (e.g. 4 batches for 4 parallel agents).
3. Launch parallel agents — each agent receives its batch of file paths plus the full migration table and search patterns from this skill.
4. Each agent, for every file in its batch: **reads the entire file** (not just grep matches), searches for every deprecated pattern in context, applies the corresponding replacement, and verifies the file still parses.
5. After all agents complete, do a final sweep: **re-read every modified file** to confirm no deprecated patterns remain and no regressions were introduced.

### Step 7 — Update Lambda Feature Sets

Change Lambda Feature Set runtime claims to use the resolved `_312` runtime and test for Pandas 2.2 compatibility.

### Step 8 — Update Custom Pipes

Update any custom pipes that claim Python 3.9 runtimes to use the resolved `_312` runtimes and test for library compatibility.

### Step 9 — Update Pipelines and Models

- Replace Platform atomic pipe references with `_312` variants using the migration utility.
- Test pipelines end-to-end.
- For trained models, verify they work with the new library versions or retrain. If models are incompatible, keep them at 3.9 until retrained.

### Step 10 — Update Jupyter Notebooks

Switch notebook kernels to a Python 3.12 runtime (e.g. `py-data-plot_312`) and verify notebooks run correctly.

### Step 11 — Verify Persisted Data

Test that `Data.Persisted` files remain readable with new runtimes. Apache Arrow format is generally safe; pickled Pandas DataFrames with multi-indexes may require data migration.

### Step 12 — Verify No Invalid Claims Remain

Cross-check every runtime claim against the fingerprint to ensure nothing invalid was introduced:

```bash
grep -roh ' py-[a-z0-9_-]*' src/ test/ --include="*.c3typ" | sort -u | \
  while read rt; do
    grep -q "^${rt# }:" gen/cache/ImplLanguage.RuntimeDeps#runtimeFingerprint.txt \
      || echo "INVALID: $rt"
  done
```

## Keeping Code on Python 3.9 (Opt-Out)

| Scenario                        | Action                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| Actions with bare `py` claim    | Change to an explicit 3.9 runtime (e.g. `py-data`)           |
| `c3.Data` results in 3.9 client | Call `.to_pandas()` immediately before any Pandas operations |
| Lambda Feature Sets             | Set explicit 3.9 runtime claim (e.g. `py-data`)              |
| Jupyter `py-data-plot` kernel   | Install it manually from the Kernel Management panel         |

## Common Pandas 2.2 Migration Patterns

```python
# DataFrame.append() removed — use pd.concat
# Before
df = df.append(new_row, ignore_index=True)
# After
df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)

# Int64Index / Float64Index removed — use Index with dtype
# Before
idx = pd.Int64Index([1, 2, 3])
# After
idx = pd.Index([1, 2, 3], dtype="int64")

# .replace() / .fillna() no longer auto-downcast
# After (explicit)
df["col"] = df["col"].fillna(0).infer_objects()

# date_range closed → inclusive
# Before
pd.date_range("2024-01-01", "2024-12-31", closed="left")
# After
pd.date_range("2024-01-01", "2024-12-31", inclusive="left")

# pct_change fill_method deprecated
# Before
series.pct_change(fill_method="ffill")
# After
series.ffill().pct_change()

# SQLAlchemy — upgrade to >= 2.0 (1.4 compatibility deprecated in Pandas 2.2)

# eval().to_pandas() is now required before Pandas operations
# Before
result = c3.MyType.eval(projection="id, value")
result_df = result  # worked in 3.9
# After
result = c3.MyType.eval(projection="id, value")
result_df = result.to_pandas()

# Data.from_pandas() → Data.Persisted.from_pandas()
# Before
data = c3.Data.from_pandas(df)
# After
data = c3.Data.Persisted.from_pandas(df)
```

## Python Standard Library Changes

| Deprecated / Removed                | Replacement                                                     |
| ----------------------------------- | --------------------------------------------------------------- |
| `array.tostring()` / `fromstring()` | `tobytes()` / `frombytes()`                                     |
| `pathlib.Path.link_to()`            | `.hardlink_to()`                                                |
| `threading.*` legacy methods        | `.is_set()`, `.name`, `.daemon` properties                      |
| `locale.getdefaultlocale()`         | `locale.getlocale()` or `locale.getencoding()`                  |
| `cgi` module                        | Deprecated; use `urllib.parse`, `email.message`, or `multipart` |
| `distutils` module                  | Removed in 3.12; use `setuptools`                               |
| `imp` module                        | Removed; use `importlib`                                        |
| Invalid backslash escape sequences  | Fix regex patterns (now `SyntaxWarning`, will be `SyntaxError`) |
| `re.template` / `T` flags           | Deprecated                                                      |
| `configparser` legacy APIs          | Use newer `ConfigParser` interfaces                             |
| `importlib.resources` old functions | Use 3.9+ API                                                    |

## Available 3.12 Runtimes

| Runtime              | Key Libraries                              |
| -------------------- | ------------------------------------------ |
| `py-data_312`        | numpy 1.26.4, pandas 2.2.3, polars 0.19.14 |
| `py-sklearn_312`     | scikit-learn 1.6.1                         |
| `py-tf_312`          | tensorflow 2.18                            |
| `py-matplotlib_312`  | matplotlib 3.10, pillow 10.2.0             |
| `py-arrow_312`       | pyarrow 19.0.0                             |
| `py-scipy_312`       | scipy 1.11.4                               |
| `py-statsmodels_312` | statsmodels 0.14.4, sktime 0.37.1          |
| `py-xgboost_312`     | xgboost 3.0.2                              |
| `py-optuna_312`      | optuna 4.4                                 |
| `py-shap_312`        | shap 0.48.0                                |
| `py-seaborn_312`     | seaborn 0.13.2                             |
| `py-dill_312`        | dill 0.3.9                                 |

## Key Library Versions

| Library      | Old (3.9) | New (3.12) | Runtime            |
| ------------ | --------- | ---------- | ------------------ |
| numpy        | 1.22.4    | 1.26.4     | py-data_312        |
| pandas       | 1.3.4     | 2.2.3      | py-data_312        |
| scikit-learn | 0.24.2    | 1.6.1      | py-sklearn_312     |
| xgboost      | 1.7.1     | 3.0.2      | py-xgboost_312     |
| tensorflow   | 2.12.1    | 2.18       | py-tf_312          |
| matplotlib   | 3.4.3     | 3.10       | py-matplotlib_312  |
| pyarrow      | 14.0.1    | 19.0.0     | py-arrow_312       |
| scipy        | 1.10.0    | 1.11.4     | py-scipy_312       |
| statsmodels  | 0.13      | 0.14.4     | py-statsmodels_312 |
| shap         | 0.40      | 0.48.0     | py-shap_312        |
| seaborn      | 0.11      | 0.13.2     | py-seaborn_312     |
| sktime       | 0.14.1    | 0.37.1     | py-statsmodels_312 |
| optuna       | 2.10      | 4.4        | py-optuna_312      |
| polars       | 0.16.11   | 0.19.14    | py-data_312        |
| dill         | 0.3.9     | 0.3.9      | py-dill_312        |
| pillow       | 10.2.0    | 10.2.0     | py-matplotlib_312  |

## Testing Checklist

After migration, verify:

1. All custom runtimes build successfully with Python 3.12
2. Actions execute without import errors
3. Lambda feature sets produce correct results
4. Pipelines complete successfully
5. Trained models produce expected predictions
6. Jupyter notebooks run without errors
7. `Data.Persisted` files are readable
8. No Pandas deprecation warnings in logs
9. No invalid runtime claims remain (Step 12)

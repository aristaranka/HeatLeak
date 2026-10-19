# Python 3.12 Migration — Detailed Reference

## Table of Contents

1. [Python Deprecations and Removals (3.9–3.12)](#python-deprecations-and-removals)
2. [Pandas Deprecations and Removals (1.4–2.2)](#pandas-deprecations-and-removals)
3. [C3 Data API Changes](#c3-data-api-changes)
4. [Key Library Version Mapping](#key-library-version-mapping)

---

## Python Deprecations and Removals

| Version | Deprecated / Removed                                            | Replacement or Note                               |
| ------- | --------------------------------------------------------------- | ------------------------------------------------- |
| 3.9     | `array.tostring()` / `fromstring()`                             | Use `tobytes()` / `frombytes()`                   |
| 3.9     | `nntplib.NNTP.xpath()`, `xgtitle()`                             | Use `.descriptions()`                             |
| 3.9     | `sys.callstats()`, `get/setcheckinterval()`                     | Removed                                           |
| 3.10    | `threading.*` legacy methods                                    | Use `.is_set()`, `.name`, `.daemon` properties    |
| 3.10    | `pathlib.Path.link_to()`                                        | Use `.hardlink_to()`                              |
| 3.10    | `cgi.log()`                                                     | Deprecated                                        |
| 3.10    | `ssl OP_NO_SSL*`, `PROTOCOL_SSL*`                               | Use `SSLContext.minimum_version`, `wrap_socket()` |
| 3.11    | `classmethod` chaining                                          | Use `__wrapped__`                                 |
| 3.11    | Octal escapes > `0o377`                                         | Avoid; future SyntaxError                         |
| 3.11    | `int()` fallback via `__trunc__`                                | Implement `__int__` or `__index__`                |
| 3.11    | `configparser` legacy APIs                                      | Use newer `ConfigParser` interfaces               |
| 3.11    | `importlib.resources` old functions                             | Use 3.9+ API                                      |
| 3.11    | `locale.getdefaultlocale()`, `turtle.settiltangle()`            | Use recommended replacements                      |
| 3.11    | `typing.Text`, `TypedDict` syntax, `webbrowser.MacOSX`          | Use modern alternatives                           |
| 3.11    | `unittest` oddities (`.findTestCases`, `.usageExit`)            | Replace with `TestLoader`, remove `usageExit`     |
| 3.11    | `re.template` / `T` flags                                       | Deprecated                                        |
| 3.12    | C-API `wstr`, removed `smptd` / `distutils` / `imp`             | Use `importlib`, other modules                    |
| 3.12    | Old `unittest` bits                                             | Removed                                           |
| 3.12    | Invalid backslash escape sequences                              | Now `SyntaxWarning`; will be `SyntaxError`        |
| 3.12    | Pending removals (CGI handler, `locale.getdefaultlocale`, etc.) | Removal by Python 3.15                            |

---

## Pandas Deprecations and Removals

| Version | Deprecated / Removed                          | Replacement or Alternative                     |
| ------- | --------------------------------------------- | ---------------------------------------------- |
| 1.4     | `Int64Index`, `UInt64Index`, `Float64Index`   | Use `Index` with specified `dtype`             |
| 1.4     | `DataFrame.append()`, `Series.append()`       | Use `pd.concat([...])`                         |
| 2.0.0   | `fill_method=None` deprecated in `pct_change` | Use explicit method or default behaviors       |
| 2.0.0   | `pd.date_range` `closed` parameter            | Replace `closed` with `inclusive`              |
| 2.2.0   | Auto downcasting in `.replace()`, `.fillna()` | Use `infer_objects()` or set option to opt-in  |
| 2.2.0   | SQLAlchemy 1.4 compatibility                  | Upgrade to SQLAlchemy >= 2.0                   |
| 2.2.0   | Chained assignment warning (via COW setting)  | Use safer assignment or enable `copy_on_write` |

### Common Pandas Migration Patterns

```python
# 1. DataFrame.append() → pd.concat()
# Before (Pandas 1.x)
df = df.append(new_row, ignore_index=True)
# After (Pandas 2.x)
df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)

# 2. Int64Index / Float64Index → Index with dtype
# Before
idx = pd.Int64Index([1, 2, 3])
# After
idx = pd.Index([1, 2, 3], dtype="int64")

# 3. .replace() / .fillna() auto-downcast removed
# Before (implicit downcast)
df["col"] = df["col"].fillna(0)
# After (explicit)
df["col"] = df["col"].fillna(0).infer_objects()

# 4. date_range closed → inclusive
# Before
pd.date_range("2024-01-01", "2024-12-31", closed="left")
# After
pd.date_range("2024-01-01", "2024-12-31", inclusive="left")

# 5. Copy-on-Write (CoW) — opt in for forward compatibility
pd.set_option("mode.copy_on_write", True)
```

---

## C3 Data API Changes

| Deprecated                   | Replacement                              |
| ---------------------------- | ---------------------------------------- |
| `eval().<pandas_operations>` | `eval().to_pandas().<pandas_operations>` |
| `Data.from_pandas()`         | `Data.Persisted.from_pandas()`           |

```python
# eval() pattern — always call to_pandas() first
# Before (3.9 — implicit conversion)
result = c3.MyType.eval(projection="id, value")
df = result  # direct usage as DataFrame

# After (3.12 — explicit conversion)
result = c3.MyType.eval(projection="id, value")
df = result.to_pandas()

# Data.from_pandas() replacement
# Before
data = c3.Data.from_pandas(my_dataframe)
# After
data = c3.Data.Persisted.from_pandas(my_dataframe)
```

---

## Key Library Version Mapping

| Library      | Runtime that defines it | Old Version (3.9) | New Version (3.12) |
| ------------ | ----------------------- | ----------------- | ------------------ |
| dill         | py-dill_312             | 0.3.9             | 0.3.9              |
| matplotlib   | py-matplotlib_312       | 3.4.3             | 3.10               |
| numpy        | py-data_312             | 1.22.4            | 1.26.4             |
| optuna       | py-optuna_312           | 2.10              | 4.4                |
| pandas       | py-data_312             | 1.3.4             | 2.2.3              |
| pillow       | py-matplotlib_312       | 10.2.0            | 10.2.0             |
| polars       | py-data_312             | 0.16.11           | 0.19.14            |
| pyarrow      | py-arrow_312            | 14.0.1            | 19.0.0             |
| scikit-learn | py-sklearn_312          | 0.24.2            | 1.6.1              |
| scipy        | py-scipy_312            | 1.10.0            | 1.11.4             |
| seaborn      | py-seaborn_312          | 0.11              | 0.13.2             |
| shap         | py-shap_312             | 0.40              | 0.48.0             |
| sktime       | py-statsmodels_312      | 0.14.1            | 0.37.1             |
| statsmodels  | py-statsmodels_312      | 0.13              | 0.14.4             |
| tensorflow   | py-tf_312               | 2.12.1            | 2.18               |
| xgboost      | py-xgboost_312          | 1.7.1             | 3.0.2              |

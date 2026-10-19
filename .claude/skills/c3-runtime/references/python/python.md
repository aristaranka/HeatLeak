# Python Runtime Reference

## Table of Contents

1. [Naming Conventions](#naming-conventions)
2. [Parent Runtimes](#parent-runtimes)
3. [Library Format](#library-format)
4. [Complete Example](#complete-example)
5. [Updating Runtimes](#updating-runtimes)
6. [Troubleshooting](#troubleshooting)
7. [Quick Reference](#quick-reference)

---

## Naming Conventions

### ImplLanguage.Runtime (Definition Name)

| Format      | Description                                             |
| ----------- | ------------------------------------------------------- |
| `py-<name>` | Base runtime definition name (e.g., `py-jeff`, `py-ml`) |

### Python 3.12 Runtimes (Platform 8.9+)

| Format                               | Purpose                            |
| ------------------------------------ | ---------------------------------- |
| `py.3.12-<name>-server-py4j`         | Server-side execution              |
| `py.3.12-<name>-client-ipython`      | Jupyter/notebook execution         |
| `py.3.12-<name>-server-py4j-test`    | Server-side with testing libraries |
| `py.3.12-<name>-client-ipython-test` | Client-side with testing libraries |

**Examples:**

- `py.3.12-jeff-server-py4j`
- `py.3.12-litellm_312-server-py4j`

### Python 3.9 Runtimes (Platform 8.8 and earlier)

| Format                     | Purpose                    |
| -------------------------- | -------------------------- |
| `py-<name>-server-py4j`    | Server-side execution      |
| `py-<name>-client-ipython` | Jupyter/notebook execution |

**Examples:**

- `py-ml-server-py4j`
- `py-data-science-server-py4j`

### Naming Pattern Summary

| Python Version | Server Runtime               | Client Runtime                  |
| -------------- | ---------------------------- | ------------------------------- |
| 3.12           | `py.3.12-<name>-server-py4j` | `py.3.12-<name>-client-ipython` |
| 3.9            | `py-<name>-server-py4j`      | `py-<name>-client-ipython`      |

---

## Parent Runtimes

### Guidelines

- **Platform 8.9+**: Use Python 3.12 based parents (e.g., `py-data-science_312`)
- **Earlier platforms**: Use Python 3.9 based parents (e.g., `py-data-science`)
- **ML workloads**: Consider `py-ml` or `py-ml_312` as parent
- **Custom pipes**: Must include `numpy`, `scipy`, `pandas`, `dill`

### Common Parent Runtimes

| Parent                | Description                                     | Python version |
| --------------------- | ----------------------------------------------- | -------------- |
| `py-data_312`         | Pandas 2 support; same as used for Jep executor | 3.12           |
| `py-data-science_312` | Base data science packages                      | 3.12           |
| `py-ml_312`           | Machine learning packages                       | 3.12           |
| `py-llm_312`          | Base runtime for agents and tools               | 3.12           |
| `py-c3agents`         | Base runtime for Dynamic Agent                  | 3.12           |
| `py-data`             | Pandas 1.3 support for pre-8.9 applications     | 3.9            |
| `py-data-science`     | Base data science                               | 3.9            |

---

## Library Format

```
"<package-manager> <package-name>[==version]"
```

### Package Preference Order

1. **conda** - Better dependency resolution, preferred
2. **pip** - Use when package not available on conda

### Examples

- `"conda scikit-learn>1.0,<2.0"`
- `"pip tensorflow==2.18.*"`
- `"conda llama-index"`
- `"pip some-pip-only-package==1.2.3"`

---

## Complete Example

```python
# 1. Check for existing runtimes with the library you need
runtimes = c3.Py.Runtime.fetch({
    "filter": "contains(name, 'litellm')",
    "limit": 50
}).objs
for r in runtimes:
    print(r.name)

# 2. Check if your desired runtime name is already taken
existing = c3.ImplLanguage.Runtime.forName('py-myruntime')
if existing:
    print("WARNING: Runtime 'py-myruntime' already exists - upsert will overwrite it")
    print(existing.toJson())

# 3. If none exist or you want to create/update, define new runtime
custom_runtime = c3.ImplLanguage.Runtime.fromJson({
    "name": "py-myruntime",
    "languageVersion": "3.12",
    "libraries": [
        "conda llama-index",
        "pip some-pip-only-package"
    ],
    "repositories": ["conda-forge", "defaults"],
    "parents": ["py-data-science_312"]
})

# 4. Upsert and check for errors
result = c3.Py.upsertRuntime(custom_runtime)
if result["errors"]:
    print("Errors:", result["errors"])
else:
    print("Success! Created runtimes:", list(result["seededRuntimes"].keys()))

# 5. Verify creation
runtime = c3.ImplLanguage.Runtime.forName('py-myruntime')
print(runtime.toJson())

# 5. Verify Py.Runtime variants created
runtimes = c3.Py.Runtime.fetch({
    "filter": "contains(name, 'myruntime')",
    "limit": 10
}).objs
print([r.name for r in runtimes])
# Expected: ['py.3.12-myruntime-server-py4j', 'py.3.12-myruntime-client-ipython', ...]
```

---

## Updating Runtimes

To modify a runtime (e.g., change from pip to conda):

```python
# 1. Update the definition
updated_runtime = c3.ImplLanguage.Runtime.fromJson({
    "name": "py-myruntime",
    "languageVersion": "3.12",
    "libraries": ["conda llama-index"],  # Changed from pip
    "repositories": ["conda-forge", "defaults"],
    "parents": ["py-data-science_312"]
})

result = c3.Py.upsertRuntime(updated_runtime)

# 2. Reinstall using c3-runtime skill workflow
```

---

## Troubleshooting

### Dependency Conflict Example

```python
# FAILS - langchain 1.x requires langgraph>=1.0.0
runtime = c3.ImplLanguage.Runtime.fromJson({
    "name": "py-badruntime",
    "languageVersion": "3.12",
    "libraries": [
        "conda langgraph==0.4.3",
        "conda langchain>=1.0"
    ],
    "parents": ["py-data-science_312"]
})

result = c3.Py.upsertRuntime(runtime)
# result["errors"] will contain: "The conflict is caused by: langchain 1.x depends on langgraph>=1.0.0..."
```

### Package Not Found on Conda

If a package or specific version is not available on conda-forge/defaults channels (error: `PackagesNotFoundError`):

1. **Check PyPI**: Use `fetch_webpage` to check https://pypi.org/project/<package-name>/ for the latest pip version
2. **Use pip instead of conda**: Change the library format from `conda <package>` to `pip <package>>=<version>`

**Example - When conda doesn't have the latest version:**

```python
# Conda-forge may lag behind PyPI releases
# If conda shows "PackagesNotFoundError" for pandas>=3.0:

runtime = c3.ImplLanguage.Runtime.fromJson({
    "name": "py-pandas3_312",
    "languageVersion": "3.12",
    "libraries": ["pip pandas>=3.0"],  # Use pip instead of conda
    "repositories": ["conda-forge", "defaults"],
    "parents": ["py-data-science_312"]
})
```

**Note:** Prefer conda when available for better dependency resolution, but pip is a valid fallback for newer packages.

### Common Issues

| Issue               | Solution                                         |
| ------------------- | ------------------------------------------------ |
| ModuleNotFoundError | Package missing from runtime definition          |
| Version conflicts   | Try relaxing version constraints                 |
| Repository issues   | Ensure `conda-forge` is included in repositories |

### Resolution Strategies

1. **Check existing runtimes** - A compatible runtime may already exist
2. **Use compatible versions** - e.g., `langgraph>=1.0` with `langchain>=1.0`
3. **Remove conflicting constraint** - Let the solver pick compatible versions

---

## Quick Reference

| Action                     | Command                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| Search runtimes by library | `c3.Py.Runtime.fetch({"filter": "contains(name, 'xyz')"})`                |
| Check if name exists       | `c3.ImplLanguage.Runtime.forName('py-xyz')` - returns `None` if not found |
| Create/update runtime      | `c3.Py.upsertRuntime(runtime_definition)`                                 |
| Get runtime details        | `c3.ImplLanguage.Runtime.forName('py-xyz').toJson()`                      |
| Use in C3 type             | `py(runtime='py.3.12-xyz-server-py4j')`                                   |

# Testing C3 Instructions — pytest (Python)

Use this guide whenever you add or edit Python-based tests in the `test/` tree.

## File & Folder Conventions

| Purpose                          | Path / Name                                     | Notes                                                                                                     |
| -------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Shared fixtures & helpers        | `test/conftest.py` _(optional but recommended)_ | Holds reusable fixtures such as context setup, data factories, code execution helpers, test doubles, etc. |
| Per-feature / per-type test file | `test/py/test_<TypeName>.py` <br>or `*_test.py` | One file per logical unit (a type, an API, or a single LLM-generated function).                           |

**Discovery:** pytest automatically collects anything named `test_*.py` or `*_test.py` (and functions/classes inside beginning with `test`).

## Action Requirements

The test directory name must match the runtime needed. Append `-server` for server-side only tests.

| Directory           | Engine          | Description                                           |
| ------------------- | --------------- | ----------------------------------------------------- |
| `py-ml-server`      | Python ML       | ML/analytics Python tests (common for app developers) |
| `py-jep-server`     | Jep             | Jep runtime, server-side                              |
| `py-py4j-server`    | Py4j            | Py4j runtime, server-side                             |
| `py-llm_312-server` | Python 3.12 LLM | GenAI/LLM tests                                       |

## Header Boilerplate

Every pytest file should start with this stub to satisfy static type checkers while staying runtime-safe:

```python
from typing import TYPE_CHECKING
import pytest

if TYPE_CHECKING:          # keeps editors quiet; has no runtime cost
    c3 = {}                # "fake-import" of the platform namespace
```

## Action Requirements (Directory Naming)

The test directory name must match the runtime needed to run the test:

| Directory           | Engine          | Description                                           |
| ------------------- | --------------- | ----------------------------------------------------- |
| `py-ml-server`      | Python ML       | ML/analytics Python tests (common for app developers) |
| `py-jep-server`     | JEP             | JEP runtime, server-side                              |
| `py-py4j-server`    | Py4j            | Py4j runtime, server-side                             |
| `py-llm_312-server` | Python 3.12 LLM | Genai/LLM tests                                       |

## conftest.py: A Reusable Fixture Library

`conftest.py` is optional but handy. Below is a minimal, generic blueprint:

```python
# test/conftest.py
from typing import TYPE_CHECKING, Callable
import types
import pytest

if TYPE_CHECKING:
    c3 = {}


@pytest.fixture(scope="module")
def create_executable_func() -> Callable[[str], types.FunctionType]:
    """Compiles a string of Python and returns the first function defined.
    Use when validating code emitted by an LLM or template engine."""
    def _factory(code_str: str):
        result = c3.CodeCaller.call(code_str, {})
        if isinstance(result, Exception):
            pytest.fail(f"Execution failed:\n{result}\n\nCode:\n{code_str}")
        func_name = code_str.split("def ", 1)[-1].split("(", 1)[0].strip()
        func = result.get(func_name)
        assert callable(func), f"Function {func_name!r} not found in execution result"
        return func
    return _factory


@pytest.fixture(scope="module")
def invalid_c3_usage():
    """Reports invalid or disallowed C3 API calls in a code blob."""
    def _checker(code_str: str):
        return c3.EvalRunner.c3SyntaxCheck(code_str, "python")
    return _checker


@pytest.fixture(scope="module")
def sample_entities():
    """Provide fresh entities and ensure cleanup afterwards."""
    ids = c3.WindTurbine.createBatch([
        {"name": "Test-1"}, {"name": "Test-2"}
    ])
    objects = [c3.WindTurbine.forId(i) for i in ids]
    yield objects
    c3.WindTurbine.removeAll(filter=f"id in {ids}", confirm=True)
```

Customise: add fixtures for authentication, metrics, random data, time travel, etc.

## Per-Type Test Template

```python
# test/py-rhino/test_MyType.py

from typing import TYPE_CHECKING
import pytest
import numpy as np       # only if you need numeric tolerances

if TYPE_CHECKING:
    c3 = {}

LLM_TESTCASE_ID = "my_business_rule"
TEST_RESULT_OBJ = None

@pytest.fixture(scope="module", autouse=True)
def _bootstrap():
    """One-time initialisation for this file."""
    global TEST_RESULT_OBJ
    TEST_RESULT_OBJ = c3.TestUtils.createResponseObj(LLM_TESTCASE_ID)
    yield

def test_code_executes(create_executable_func):
    """The generated snippet must compile & run."""
    if TEST_RESULT_OBJ:
        create_executable_func(TEST_RESULT_OBJ.generatedCode)

def test_no_invalid_c3_calls(invalid_c3_usage):
    if not TEST_RESULT_OBJ:
        pytest.skip("No generated code to analyse")
    bad_calls = invalid_c3_usage(TEST_RESULT_OBJ.generatedCode)
    assert not bad_calls, f"Disallowed C3 usage:\n{bad_calls}"

def test_mytype_range(sample_entities):
    obj = sample_entities[0]
    assert obj is not None
    assert hasattr(obj, "getRange")
    assert obj.getRange() > 0
```

## Tips

- **Data Creation**: use `Type.make({...}).upsert()` for persistent entities or `.make()` for in-memory value types.
- **Dates**: create with `c3.DateTime.fromString("2025-01-01T12:00Z")`.
- **Numeric Checks**: use `numpy.isclose` / `allclose` for floats.
- **Expected Errors**: wrap with `pytest.raises(ExpectedError): …`.
- **Parametrization**: cover multiple inputs concisely:

```python
@pytest.mark.parametrize("bad_id", ["", None, "!!!"])
def test_invalid_ids_raise(bad_id):
    with pytest.raises(c3.ServiceException):
        c3.User.forId(bad_id)
```

## Best Practices

- Use fixtures (`@pytest.fixture`) with `yield` + cleanup for test lifecycle — no manual teardown calls needed.
- Use `scope="module"` fixtures for expensive setup shared across tests in a file.
- Use `pytest.raises(ExceptionType)` for expected error assertions.
- Use `@pytest.mark.parametrize` to cover multiple inputs concisely.
- Use `numpy.isclose` / `allclose` for floating-point comparisons.
- Clean up persistent data in fixture teardown (after `yield`).

## Completion Checklist

- [ ] File is at `test/{action-requirement}/test_{name}.py` (e.g. `test/py-ml-server/test_MyType.py`)
- [ ] File includes the `TYPE_CHECKING` stub header
- [ ] Test uses fixtures for setup/teardown (no unnecessary globals)
- [ ] Persistent data is removed in fixture teardown (e.g. `yield` + cleanup in fixture)
- [ ] Numeric tolerances used where floating point math is involved

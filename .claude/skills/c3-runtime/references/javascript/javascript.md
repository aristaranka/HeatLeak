# JavaScript Runtime Reference

## Table of Contents

1. [List existing JavaScript runtimes](#list-existing-javascript-runtimes)
2. [List libraries installed in a specific runtime](#list-libraries-installed-in-a-specific-runtime)
3. [Create your own JavaScript runtime](#create-your-own-javascript-runtime)
4. [Verify package added](#verify-package-added)
5. [Troubleshooting](#troubleshooting)

---

## List existing JavaScript runtimes

```js
runtimes.objs.filter((r) => {
  let language = r.language();
  return language.toLowerCase() == 'javascript';
});
```

## List libraries installed in a specific runtime

```js
let runtime = ImplLanguage.Runtime.forName('js-documentationcompiler');
runtime.libraries;
```

## Create your own JavaScript runtime

### Single Package

```js
let runtime = ImplLanguage.Runtime.fromJson({
  name: 'js-lodash',
  libraries: ['npm lodash@4.17.21'],
});
var result = Js.upsertRuntime(runtime, 'client');
```

### Multiple Packages

```js
let runtime = ImplLanguage.Runtime.fromJson({
  name: 'js-lodash',
  libraries: ['npm lodash@4.17.21', 'npm react-select'],
});
var result = Js.upsertRuntime(runtime, 'client');
```

### Library Format

```
"npm <package-name>@<version>"
```

Examples:

- `"npm @mui/material@7.1.0"`
- `"npm next@14.2.0"`
- `"npm lodash@4.17.21"`

## Verify package added

```js
var runtime = ImplLanguage.Runtime.forName('js-lodash');
var libs = runtime.libraries;
var result = [];
for (var i = 0; i < libs.length; i++) {
  var lib = String(libs[i]);
  if (lib.indexOf('next') !== -1) {
    // Search for your package
    result.push(lib);
  }
}
result;
```

---

## Troubleshooting

### Dependency Conflict Example

```js
// FAILS - @mui/material@5.0.0 requires react@^17.0.2 but parent has react@18.3.0
var runtime = ImplLanguage.Runtime.fromJson({
  name: 'js-webpack_c3',
  libraries: ['npm @mui/material@5.0.0'],
});

var result = Js.upsertRuntime(runtime, 'client');
// result.errors contains: "npm error ERESOLVE... peer react@\"^17.0.2\" from @mui/material@5.0.0"
```

### Check for Errors

```js
var result = Js.upsertRuntime(runtime, 'client');
if (Object.keys(result.errors).length > 0) {
  JSON.stringify(result.errors, null, 2);
}
```

### Common Issues

| Issue                      | Solution                                          |
| -------------------------- | ------------------------------------------------- |
| ERESOLVE unable to resolve | Peer dependency conflict - use compatible version |
| Package not found          | Verify package name/version on npmjs.com          |

### Resolution Strategies

1. **Use compatible version** - e.g., `@mui/material@5.14.0+` works with React 18
2. **Check peer dependencies** - Review package requirements on npmjs.com
3. **Include peer dependencies explicitly** - Add required peer deps to libraries array

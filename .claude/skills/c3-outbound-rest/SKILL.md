---
name: c3-outbound-rest
description: |
  OUTBOUND-ONLY: call external third-party REST APIs FROM C3, where C3 is the HTTP CLIENT sending requests OUT. Do NOT use this to expose, serve, or publish your own C3 methods/types as an HTTP endpoint that others call IN — inbound endpoints are backend/server code. Also NOT for OAuth client setup or acquiring access tokens (that is c3-oauth). Use when defining types that mix REST with @rest annotations and making outbound GET/POST/PUT/DELETE calls, with dynamic URIs, path/query parameters, headers, and request/response bodies.
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
---

# REST Client Development with C3 AI Platform

Create REST clients to call external APIs using C3's REST mixin type system.

## Quick Start

### 1. Define a REST Client Type

```c3typ
type MyApiClient mixes REST {
  @rest(uri='endpoint', method='GET')
  getData: abstract function(): json
}
```

### 2. Initialize with Base URL and Authentication

```python
# Python
c3.MyApiClient.setApiUrlAndAuth("https://api.example.com/", "Bearer token123")

# JavaScript
MyApiClient.setApiUrlAndAuth('https://api.example.com/', 'Bearer token123');
```

### 3. Call the Endpoint

```python
# Python
data = c3.MyApiClient.getData()
```

```javascript
# JavaScript
const data = MyApiClient.getData();
```

## ⚠️ CRITICAL: Abstract Methods Need No Implementation

**Methods marked `abstract` with `@rest` annotations are DECLARATIVE ONLY.** The C3 platform automatically handles the HTTP communication for these methods:

```c3typ
type MyApiClient mixes REST {
  // Abstract method - NO implementation needed
  @rest(uri='users', method='GET')
  getUsers: abstract function(): json
}
```

**For `abstract` methods, the platform automatically handles:**

- Making HTTP requests
- Serializing parameters
- Parsing responses
- Building URIs

**Implementation files are ONLY needed when you add regular (non-abstract) helper methods:**

```c3typ
type MyApiClient mixes REST {
  // Abstract method - NO implementation needed
  @rest(uri='users', method='GET')
  getUsers: abstract function(): json

  // Regular helper method - NEEDS implementation in .js or .py file
  initialize: function() js
  fetchAllUsers: function(): [User] js
}
```

In this case, create `MyApiClient.js` to implement ONLY the helper methods (`initialize` and `fetchAllUsers`). The `abstract` method `getUsers` needs no implementation.

See "When to Add Implementation Files" section below for details.

## Core Concepts

### REST Mixin Type System

Types that `mixes REST` define **declarative REST clients**:

- Methods marked as `abstract` represent REST endpoints (no implementation needed)
- Each method requires `@rest(...)` annotation specifying HTTP details
- The platform handles HTTP communication automatically

### Method vs Member Functions

```c3typ
// Static function - call directly on type
@rest(uri='users', method='GET')
getUsers: abstract function(): json
// Usage: MyApi.getUsers()

// Member function - requires instance
@rest(uri='graphql', method='POST')
query: abstract member function(query: string): json
// Usage: myApi = MyApi.make(); myApi.query("...")
```

**Use static functions (default) unless you need to maintain instance state.**

## HTTP Methods

### GET Request

```c3typ
@rest(uri='posts', method='GET')
getPosts: abstract function(): json
```

### POST Request

```c3typ
@rest(uri='posts', method='POST', contentType='application/json')
createPost: abstract function(title: string, body: string): json
```

### PUT Request

```c3typ
@rest(uri='posts/', method='PUT')
updatePost: abstract function(
  @rest(partOfURI=true) id: string,
  title: string,
  body: string
): json
```

### DELETE Request

```c3typ
@rest(uri='posts/', method='DELETE')
deletePost: abstract function(@rest(partOfURI=true) id: string): json
```

## Path Parameters

Use `@rest(partOfURI=true)` to include parameters in the URI path:

```c3typ
// Simple: GET /users/{id}
@rest(uri='users/', method='GET')
getUser: abstract function(@rest(partOfURI=true) id: string): json

// Complex: GET /repos/{owner}/{repo}/pulls/{number}
@rest(uri='repos', method='GET')
getPullRequest: abstract function(
  @rest(partOfURI=true, uriPrefix='/') owner: string,
  @rest(partOfURI=true, uriPrefix='/') repo: string,
  @rest(partOfURI=true, uriPrefix='/pulls/') number: int
): json
```

**URI building order:** Parameters with `partOfURI=true` are processed in order, each with its `uriPrefix` → value → `uriSuffix`.

## Query Parameters

Parameters NOT marked with `partOfURI=true` or `header=true` automatically become query parameters (for GET) or body parameters (for POST/PUT/PATCH):

```c3typ
@rest(uri='posts', method='GET')
searchPosts: abstract function(userId: int, limit: int, offset: int): json
// Calls: GET /posts?userId={userId}&limit={limit}&offset={offset}
```

## Authentication

### Bearer Token

```python
c3.MyApi.setApiUrlAndAuth("https://api.example.com/", "Bearer token123")
```

### API Key in Header

```c3typ
@rest(uri='data', method='GET')
getData: abstract function(
  @rest(header=true, headerName='X-API-Key') apiKey: string
): json
```

### Custom Headers

```c3typ
@rest(uri='endpoint', method='POST')
postData: abstract function(
  @rest(header=true, headerName='Authorization') auth: string,
  @rest(header=true, headerName='X-Request-ID') requestId: string,
  payload: json
): json
```

### OAuth2 Pattern

Store credentials in a Config type, implement token refresh logic. See [authentication-patterns.md](references/authentication-patterns.md) for complete OAuth2 example.

## Response Handling

### Using `json` Return Type

```c3typ
@rest(uri='posts', method='GET')
getPosts: abstract function(): json
```

Returns the response body as JSON directly.

### Using `HttpResponse` Return Type

```c3typ
@rest(uri='posts', method='POST')
createPost: abstract function(title: string, body: string): HttpResponse
```

```javascript
const response = MyApi.createPost('Title', 'Body');

if (response.statusCode === 201) {
  const data = response.json();
  return data;
} else if (response.statusCode === 400) {
  throw new Error('Validation error: ' + response.json().message);
} else {
  throw new Error('Unexpected status: ' + response.statusCode);
}
```

**Use `HttpResponse` when you need to check status codes or handle errors explicitly.**

## Configuration Pattern

Store API configuration and credentials in a Config type:

```c3typ
type MyApiConfig mixes Config, Singleton {
  @config
  baseUrl: !string = "https://api.example.com/"

  @config(secret=true)
  apiToken: string
}
```

```python
def initialize(cls):
    config = c3.MyApiConfig.getConfig()
    base_url = config.baseUrl
    token = config.getSecret().apiToken
    c3.MyApi.setApiUrlAndAuth(base_url, "Bearer " + token)
```

## When to Add Implementation Files

### Pattern 1: Only Abstract Methods (No Implementation File)

If your type has ONLY `abstract` methods with `@rest` annotations, **NO implementation file is needed**:

```c3typ
type MyApiClient mixes REST {
  @rest(uri='users', method='GET')
  getUsers: abstract function(): json

  @rest(uri='posts', method='POST')
  createPost: abstract function(title: string, body: string): json
}
```

**NO `MyApiClient.js` or `MyApiClient.py` file needed.** Just call it directly:

```javascript
// Initialize once
MyApiClient.setApiUrlAndAuth('https://api.example.com/', 'Bearer token');

// Use directly - no implementation needed
const users = MyApiClient.getUsers();
const post = MyApiClient.createPost('Title', 'Body');
```

### Pattern 2: Abstract + Helper Methods (One Implementation File)

If you need helper functions, add them as **regular (non-abstract) methods in the same type**:

```c3typ
type MyApiClient mixes REST {
  // Abstract REST methods - no implementation needed
  @rest(uri='users', method='GET')
  getUsers: abstract function(): json

  @rest(uri='posts', method='POST')
  createPost: abstract function(title: string, body: string): json

  // Helper methods - NEED implementation
  initialize: function() js
  fetchAllUsers: function(): [User] js
  createUserWithValidation: function(name: string, email: string): User js
}
```

**Create `MyApiClient.js` to implement ONLY the helper methods:**

```javascript
// MyApiClient.js - Implement ONLY non-abstract methods
function initialize() {
  const config = MyApiConfig.getConfig();
  MyApiClient.setApiUrlAndAuth(config.baseUrl, 'Bearer ' + config.apiToken);
}

function fetchAllUsers() {
  initialize();
  const response = MyApiClient.getUsers(); // Uses abstract method
  return response.data || [];
}

function createUserWithValidation(name, email) {
  if (!email.includes('@')) {
    throw new Error('Invalid email');
  }
  initialize();
  return MyApiClient.createUser(name, email); // Uses abstract method
}
```

### Key Principles

- **`abstract` methods with `@rest`** = No implementation needed (platform handles it)
- **Regular methods** = Must be implemented in `.js` or `.py` file
- **Both can coexist in one type** - create implementation file only if you have regular methods
- **Only implement the non-abstract methods** - never implement abstract REST methods

### Testing

**DO NOT create test files unless explicitly requested by the user.**

If it's unclear whether the user wants tests:

- Ask: "Would you like me to create tests for these REST API methods?"
- Wait for confirmation before creating any test files

When tests are requested, create them in `test/js-rhino/` or `test/py-rhino/` following the patterns in `@js-testing-c3.md` or `@py-testing-c3.md`.

## Working Example: JSONPlaceholder

The JSONPlaceholder API (https://jsonplaceholder.typicode.com/) is a free, public REST API perfect for testing. See [jsonplaceholder-example.c3typ.md](references/jsonplaceholder-example.c3typ.md) for a complete, working example including:

- GET all posts
- GET specific post by ID
- POST to create a post
- PUT to update a post
- DELETE a post
- Query parameters
- Nested resources (posts/{id}/comments)

Test it:

```python
c3.JsonPlaceholderApi.setApiUrlAndAuth("https://jsonplaceholder.typicode.com/", "")
posts = c3.JsonPlaceholderApi.getAllPosts()
post = c3.JsonPlaceholderApi.getPostById("1")
```

## Reference Documentation

For detailed information, consult these reference files:

- **[rest-annotation-reference.md](references/rest-annotation-reference.md)** - Complete @rest annotation parameters with examples
- **[authentication-patterns.md](references/authentication-patterns.md)** - Authentication patterns (Bearer, API key, OAuth2, custom headers)
- **[advanced-patterns.md](references/advanced-patterns.md)** - Error handling, retry logic, pagination, caching, handling rate limits
- **[jsonplaceholder-example.c3typ.md](references/jsonplaceholder-example.c3typ.md)** - Complete working example (rename to `.c3typ` when copying to `src/`)

## Common Patterns

### Error Handling

```javascript
const response = MyApi.callEndpoint(param);

if (response.statusCode >= 400) {
  const error = response.json();
  throw new Error('API error ' + response.statusCode + ': ' + error.message);
}

return response.json();
```

### Retry Logic

See [advanced-patterns.md](references/advanced-patterns.md#error-handling-and-retry-logic) for retry with exponential backoff.

### Pagination

```python
def fetchAllItems(cls, page_size=100):
    all_items = []
    offset = 0

    while True:
        response = c3.ApiClient.getItems(limit=page_size, offset=offset)
        items = response.get('items', [])

        if not items:
            break

        all_items.extend(items)
        offset += page_size

    return all_items
```

### GraphQL

```c3typ
@rest(uri='graphql', method='POST')
query: abstract function(query: string, variables: json): json
```

```javascript
const query = `
  query GetUser($id: ID!) {
    user(id: $id) { name email }
  }
`;
const result = GraphQLApi.query(query, { id: '123' });
```

## Best Practices

1. **Always call `setApiUrlAndAuth()` before making requests** - Initialize once, typically in a setup function
2. **Use Config types for credentials** - Store secrets with `@config(secret=true)`
3. **Check status codes** - Use `HttpResponse` return type for proper error handling
4. **Implement retry logic for 5xx errors** - Don't retry 4xx (client errors)
5. **Use pagination for large datasets** - Never fetch all records at once
6. **Cache responses when appropriate** - Reduce API calls and respect rate limits
7. **Handle token expiration** - Implement refresh logic for OAuth2
8. **Test with real APIs** - Use JSONPlaceholder or httpbin for testing

## Troubleshooting

### "Method not found" error

- Ensure the type `mixes REST`
- Verify method is marked as `abstract`
- Check that `@rest(...)` annotation is present

### "URI not found" or 404 errors

- Verify the URI path construction with path parameters
- Check `uriPrefix` and `uriSuffix` are correct
- Confirm base URL in `setApiUrlAndAuth()` includes trailing slash if needed

### Authentication failures

- Verify token/credentials in Config type
- Check header name matches API requirements (e.g., "Authorization" vs "X-API-Key")
- Confirm token prefix (e.g., "Bearer " vs "Token ")

### Unexpected query parameters

- Parameters not marked with `partOfURI=true` or `header=true` become query params
- Use `@rest(partOfURI=true)` for path parameters
- Use `@rest(header=true, headerName='...')` for headers

## When to Use This Skill

Use this skill when you need to:

- ✅ Call external REST APIs from C3 AI Platform
- ✅ Define declarative REST client types
- ✅ Handle authentication with external services
- ✅ Build complex URIs with path parameters
- ✅ Implement pagination, retry logic, or caching
- ✅ Work with GraphQL APIs via POST requests
- ✅ Test REST integrations with JSONPlaceholder

**Do NOT use this skill for:**

- ❌ Creating REST endpoints that expose C3 services (use `@restful` annotation instead)
- ❌ Making HTTP requests from Python using `requests` library (this skill is about the C3 REST mixin)
- ❌ WebSocket or streaming protocols (REST is HTTP request/response only)

## Additional Resources

- JSONPlaceholder API: https://jsonplaceholder.typicode.com/
- httpbin (for testing): https://httpbin.org/
- C3 Platform Documentation: [REST Types section]

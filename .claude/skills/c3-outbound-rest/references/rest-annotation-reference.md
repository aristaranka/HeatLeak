# @rest Annotation Complete Reference

This document provides a comprehensive reference for the `@rest` annotation used in REST mixin types.

## Table of Contents

1. [Method-Level Annotations](#method-level-annotations)
2. [Parameter-Level Annotations](#parameter-level-annotations)
3. [URI Building](#uri-building)
4. [Query Parameters](#query-parameters)
5. [Request Body](#request-body)
6. [Response Handling](#response-handling)
7. [Complete Examples](#complete-examples)

---

## Method-Level Annotations

Applied to the function declaration itself.

### `uri`

**Type:** `string`
**Required:** Yes
**Description:** Base URI path for the endpoint

```c3typ
@rest(uri='posts', method='GET')
getPosts: abstract function(): json
// Calls: GET /posts
```

```c3typ
@rest(uri='api/v1/users', method='GET')
getUsers: abstract function(): json
// Calls: GET /api/v1/users
```

### `method`

**Type:** `string`
**Required:** Yes
**Valid Values:** `'GET'`, `'POST'`, `'PUT'`, `'DELETE'`, `'PATCH'`
**Description:** HTTP method for the request

```c3typ
@rest(uri='posts', method='POST')
createPost: abstract function(title: string, body: string): json

@rest(uri='posts/', method='DELETE')
deletePost: abstract function(@rest(partOfURI=true) id: string): json
```

### `contentType`

**Type:** `string`
**Required:** No
**Default:** `'application/json'`
**Description:** Content-Type header for the request

```c3typ
@rest(uri='upload', method='POST', contentType='multipart/form-data')
uploadFile: abstract function(file: binary): json

@rest(uri='data', method='POST', contentType='application/x-www-form-urlencoded')
submitForm: abstract function(key: string, value: string): json
```

### `acceptHeader`

**Type:** `string`
**Required:** No
**Default:** `'*/*'`
**Description:** Accept header value for the response

```c3typ
@rest(uri='repos', method='GET', acceptHeader='application/vnd.github.v3+json')
getRepos: abstract function(): json

@rest(uri='data', method='GET', acceptHeader='application/xml')
getXmlData: abstract function(): string
```

### `skipThis`

**Type:** `boolean`
**Required:** No
**Default:** `false`
**Description:** For member functions, excludes `this` from the request body

```c3typ
// Without skipThis, 'this' object fields are included in request body
@rest(uri='update', method='POST')
updateSelf: abstract member function(newData: json): json

// With skipThis, only 'newData' is sent in request body
@rest(uri='update', method='POST', skipThis=true)
updateSelf: abstract member function(newData: json): json
```

---

## Parameter-Level Annotations

Applied to individual function parameters using `@rest(...)` before the parameter name.

### `partOfURI`

**Type:** `boolean`
**Required:** No (use when parameter should be in URI path)
**Description:** Includes the parameter value in the URI path

```c3typ
// Simple path parameter
@rest(uri='posts/', method='GET')
getPost: abstract function(@rest(partOfURI=true) id: string): json
// Calls: GET /posts/{id}

// Multiple path parameters (order matters!)
@rest(uri='users/', method='GET')
getUserPost: abstract function(
  @rest(partOfURI=true) userId: string,
  @rest(partOfURI=true, uriPrefix='/posts/') postId: string
): json
// Calls: GET /users/{userId}/posts/{postId}
```

### `uriPrefix`

**Type:** `string`
**Required:** No (used with `partOfURI=true`)
**Description:** String to prepend before the parameter value in the URI

```c3typ
@rest(uri='repos', method='GET')
getRepo: abstract function(
  @rest(partOfURI=true, uriPrefix='/') owner: string,
  @rest(partOfURI=true, uriPrefix='/') repo: string
): json
// Calls: GET /repos/{owner}/{repo}
```

### `uriSuffix`

**Type:** `string`
**Required:** No (used with `partOfURI=true`)
**Description:** String to append after the parameter value in the URI

```c3typ
@rest(uri='posts/', method='GET')
getComments: abstract function(
  @rest(partOfURI=true, uriSuffix='/comments') postId: string
): json
// Calls: GET /posts/{postId}/comments

// Combining prefix and suffix
@rest(uri='repos', method='GET')
getPullRequests: abstract function(
  @rest(partOfURI=true, uriPrefix='/') fullRepoName: string,
  @rest(partOfURI=true, uriPrefix='/pulls/', uriSuffix='/comments') prNumber: int
): json
// Calls: GET /repos/{fullRepoName}/pulls/{prNumber}/comments
```

### `header`

**Type:** `boolean`
**Required:** No (use when parameter should be sent as HTTP header)
**Description:** Sends the parameter as an HTTP header

```c3typ
@rest(uri='data', method='GET')
getData: abstract function(
  @rest(header=true, headerName='X-API-Key') apiKey: string
): json
// Sends: GET /data with header "X-API-Key: {apiKey}"

// Multiple headers
@rest(uri='secure', method='POST')
postData: abstract function(
  @rest(header=true, headerName='Authorization') auth: string,
  @rest(header=true, headerName='X-Request-ID') requestId: string,
  payload: json
): json
// Sends:
//   POST /secure
//   Headers: "Authorization: {auth}", "X-Request-ID: {requestId}"
//   Body: {payload}
```

### `headerName`

**Type:** `string`
**Required:** Yes (when `header=true`)
**Description:** Name of the HTTP header

```c3typ
@rest(uri='api', method='GET')
callApi: abstract function(
  @rest(header=true, headerName='X-Custom-Header') customValue: string
): json
```

### `queryParam`

**Type:** `boolean`
**Required:** No
**Description:** Explicitly marks parameter as query parameter (usually automatic)

**Note:** Parameters that are NOT marked with `partOfURI=true` or `header=true` are automatically treated as query parameters (if GET/DELETE) or body parameters (if POST/PUT/PATCH). You rarely need to use this explicitly.

```c3typ
// These are equivalent - both create query parameters automatically
@rest(uri='posts', method='GET')
searchPosts: abstract function(userId: int, limit: int): json

@rest(uri='posts', method='GET')
searchPosts: abstract function(
  @rest(queryParam=true) userId: int,
  @rest(queryParam=true) limit: int
): json
// Both call: GET /posts?userId={userId}&limit={limit}
```

---

## URI Building

The final URI is constructed by concatenating:

1. Base URL (set via `setApiUrlAndAuth()`)
2. `uri` parameter from `@rest` annotation
3. Path parameters in order, with their prefixes/suffixes

### Examples

```c3typ
// Simple: base + uri
@rest(uri='posts', method='GET')
getPosts: abstract function(): json
// With setApiUrlAndAuth("https://api.example.com/", "")
// Calls: GET https://api.example.com/posts

// With path parameter
@rest(uri='posts/', method='GET')
getPost: abstract function(@rest(partOfURI=true) id: string): json
// Calls: GET https://api.example.com/posts/{id}

// Multiple path parameters with prefixes
@rest(uri='repos', method='GET')
getRepoIssue: abstract function(
  @rest(partOfURI=true, uriPrefix='/') owner: string,
  @rest(partOfURI=true, uriPrefix='/') repo: string,
  @rest(partOfURI=true, uriPrefix='/issues/') issueNum: int
): json
// Calls: GET https://api.example.com/repos/{owner}/{repo}/issues/{issueNum}

// Complex example with suffix
@rest(uri='users/', method='GET')
getUserPostComments: abstract function(
  @rest(partOfURI=true, uriSuffix='/posts') userId: string,
  @rest(partOfURI=true, uriPrefix='/', uriSuffix='/comments') postId: string
): json
// Calls: GET https://api.example.com/users/{userId}/posts/{postId}/comments
```

### URI Building Rules

1. Parameters with `@rest(partOfURI=true)` are processed **in order**
2. Each parameter's `uriPrefix` is added before the value
3. Then the parameter value itself
4. Then the parameter's `uriSuffix` is added after the value
5. Query parameters are appended as `?key=value&key2=value2`

---

## Query Parameters

Parameters that are NOT marked with `partOfURI=true` or `header=true` become:

- **Query parameters** for GET, DELETE methods
- **Body parameters** for POST, PUT, PATCH methods

### GET with Query Parameters

```c3typ
@rest(uri='posts', method='GET')
searchPosts: abstract function(userId: int, _limit: int, title: string): json
// Calls: GET /posts?userId={userId}&_limit={_limit}&title={title}

// Mix path and query parameters
@rest(uri='users/', method='GET')
getUserPosts: abstract function(
  @rest(partOfURI=true) userId: string,
  limit: int,
  offset: int
): json
// Calls: GET /users/{userId}?limit={limit}&offset={offset}
```

### Optional Query Parameters

```c3typ
@rest(uri='search', method='GET')
search: abstract function(q: string, limit: int, category: string): json
// Pass null for optional parameters to exclude them from query string
// search("test", 10, null) → GET /search?q=test&limit=10
```

---

## Request Body

For POST, PUT, PATCH methods, parameters that are NOT marked with `partOfURI=true` or `header=true` are serialized to the request body as JSON.

### Simple Body

```c3typ
@rest(uri='posts', method='POST', contentType='application/json')
createPost: abstract function(title: string, body: string, userId: int): json
// Body: {"title": "...", "body": "...", "userId": 123}
```

### JSON Parameter

```c3typ
@rest(uri='data', method='POST')
sendData: abstract function(payload: json): json
// Body: {payload} (serialized)
```

### Mix Path, Header, and Body Parameters

```c3typ
@rest(uri='posts/', method='PUT')
updatePost: abstract function(
  @rest(partOfURI=true) id: string,
  @rest(header=true, headerName='Authorization') auth: string,
  title: string,
  body: string
): json
// Path: /posts/{id}
// Header: Authorization: {auth}
// Body: {"title": "...", "body": "..."}
```

---

## Response Handling

### Return Types

| Return Type    | Description                                        | When to Use                                    |
| -------------- | -------------------------------------------------- | ---------------------------------------------- |
| `json`         | Raw JSON response                                  | When you want the response data directly       |
| `HttpResponse` | Full HTTP response with status code, headers, body | When you need to check status codes or headers |
| Custom type    | Mapped response object                             | When you want typed responses                  |

### Using `json` Return Type

```c3typ
@rest(uri='posts', method='GET')
getPosts: abstract function(): json
```

```javascript
// Usage
const posts = MyApi.getPosts();
// posts is the JSON response body directly
```

### Using `HttpResponse` Return Type

```c3typ
@rest(uri='posts', method='POST')
createPost: abstract function(title: string, body: string): HttpResponse
```

```javascript
// Usage
const response = MyApi.createPost('Title', 'Body');

if (response.statusCode === 201) {
  const data = response.json();
  console.log('Created post:', data);
} else if (response.statusCode === 400) {
  const error = response.json();
  console.error('Validation error:', error.message);
} else {
  throw new Error('Unexpected status: ' + response.statusCode);
}
```

```python
# Python usage
response = c3.MyApi.createPost("Title", "Body")

if response.statusCode == 201:
    data = response.json()
    return data
elif response.statusCode == 400:
    error = response.json()
    raise ValueError(f"Validation error: {error['message']}")
else:
    raise Exception(f"Unexpected status: {response.statusCode}")
```

### HttpResponse Methods and Properties

```javascript
// Properties
response.statusCode; // HTTP status code (200, 404, etc.)
response.headers; // Response headers as object

// Methods
response.json(); // Parse body as JSON
response.text(); // Get body as string
```

---

## Complete Examples

### Example 1: Simple GET with Query Parameters

```c3typ
type BlogApi mixes REST {
  @rest(uri='articles', method='GET')
  searchArticles: abstract function(
    category: string,
    limit: int,
    offset: int
  ): json
}
```

**Usage:**

```python
c3.BlogApi.setApiUrlAndAuth("https://blog.example.com/api/", "")
articles = c3.BlogApi.searchArticles("tech", 10, 0)
# GET https://blog.example.com/api/articles?category=tech&limit=10&offset=0
```

### Example 2: POST with Authentication Header

```c3typ
type BlogApi mixes REST {
  @rest(uri='articles', method='POST', contentType='application/json')
  createArticle: abstract function(
    @rest(header=true, headerName='Authorization') auth: string,
    title: string,
    content: string,
    category: string
  ): HttpResponse
}
```

**Usage:**

```javascript
BlogApi.setApiUrlAndAuth('https://blog.example.com/api/', '');
const response = BlogApi.createArticle('Bearer token123', 'My Article', 'Article content...', 'tech');
// POST https://blog.example.com/api/articles
// Header: Authorization: Bearer token123
// Body: {"title": "My Article", "content": "...", "category": "tech"}
```

### Example 3: Complex URI with Multiple Path Segments

```c3typ
type GitHubApi mixes REST {
  @rest(uri='repos', method='GET', acceptHeader='application/vnd.github.v3+json')
  getPullRequestComments: abstract function(
    @rest(partOfURI=true, uriPrefix='/') owner: string,
    @rest(partOfURI=true, uriPrefix='/') repo: string,
    @rest(partOfURI=true, uriPrefix='/pulls/', uriSuffix='/comments') prNumber: int
  ): json
}
```

**Usage:**

```python
c3.GitHubApi.setApiUrlAndAuth("https://api.github.com/", "Bearer " + token)
comments = c3.GitHubApi.getPullRequestComments("octocat", "hello-world", 42)
# GET https://api.github.com/repos/octocat/hello-world/pulls/42/comments
```

### Example 4: PUT with Mixed Parameters

```c3typ
type UserApi mixes REST {
  @rest(uri='users/', method='PUT', contentType='application/json')
  updateUser: abstract function(
    @rest(partOfURI=true) userId: string,
    @rest(header=true, headerName='Authorization') auth: string,
    @rest(header=true, headerName='X-Request-ID') requestId: string,
    name: string,
    email: string,
    bio: string
  ): HttpResponse
}
```

**Usage:**

```javascript
UserApi.setApiUrlAndAuth('https://api.example.com/', '');
const response = UserApi.updateUser(
  '12345', // Path parameter
  'Bearer token', // Authorization header
  'req-uuid-123', // Custom header
  'John Doe', // Body parameter
  'john@example.com', // Body parameter
  'Software engineer' // Body parameter
);
// PUT https://api.example.com/users/12345
// Headers:
//   Authorization: Bearer token
//   X-Request-ID: req-uuid-123
// Body:
//   {"name": "John Doe", "email": "john@example.com", "bio": "Software engineer"}
```

---

## Quick Reference Table

| Feature        | Annotation                               | Example                                                  |
| -------------- | ---------------------------------------- | -------------------------------------------------------- |
| HTTP Method    | `method='GET'`                           | `@rest(uri='posts', method='GET')`                       |
| Base URI       | `uri='path'`                             | `@rest(uri='api/v1/posts')`                              |
| Path Parameter | `@rest(partOfURI=true)`                  | `@rest(partOfURI=true) id: string`                       |
| URI Prefix     | `uriPrefix='/...'`                       | `@rest(partOfURI=true, uriPrefix='/repos/')`             |
| URI Suffix     | `uriSuffix='/...'`                       | `@rest(partOfURI=true, uriSuffix='/comments')`           |
| Custom Header  | `@rest(header=true, headerName='X-Key')` | `@rest(header=true, headerName='X-API-Key') key: string` |
| Content Type   | `contentType='...'`                      | `@rest(method='POST', contentType='application/json')`   |
| Accept Header  | `acceptHeader='...'`                     | `@rest(method='GET', acceptHeader='application/xml')`    |
| Skip This      | `skipThis=true`                          | `@rest(method='POST', skipThis=true)`                    |
| Query Params   | (automatic)                              | Normal params become query params in GET                 |
| Body Params    | (automatic)                              | Normal params become body in POST/PUT/PATCH              |
| JSON Response  | `function(): json`                       | Returns parsed JSON directly                             |
| Full Response  | `function(): HttpResponse`               | Returns status code + headers + body                     |

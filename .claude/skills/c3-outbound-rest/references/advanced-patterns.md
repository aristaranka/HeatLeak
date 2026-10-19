# Advanced REST Client Patterns

This document covers advanced patterns and best practices for REST clients in C3 AI Platform.

## Table of Contents

1. [Error Handling and Retry Logic](#error-handling-and-retry-logic)
2. [Rate Limiting](#rate-limiting)
3. [Pagination](#pagination)
4. [Caching Responses](#caching-responses)
5. [Webhook Handling](#webhook-handling)
6. [GraphQL APIs](#graphql-apis)
7. [File Upload/Download](#file-uploaddownload)
8. [Streaming Responses](#streaming-responses)

---

## Error Handling and Retry Logic

### Basic Error Handling

```javascript
function safeApiCall(param) {
  try {
    const response = MyApi.callEndpoint(param);

    if (response.statusCode === 200) {
      return response.json();
    } else if (response.statusCode === 404) {
      throw new Error('Resource not found: ' + param);
    } else if (response.statusCode >= 500) {
      throw new Error('Server error: ' + response.statusCode);
    } else {
      const error = response.json();
      throw new Error('API error: ' + error.message);
    }
  } catch (e) {
    console.error('API call failed:', e);
    throw e;
  }
}
```

### Retry Logic with Exponential Backoff

```python
import time

def callWithRetry(cls, func, *args, max_retries=3, initial_delay=1):
    """
    Call a REST API function with retry logic

    Args:
        func: The API function to call
        args: Arguments to pass to the function
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds (doubles with each retry)
    """
    delay = initial_delay
    last_exception = None

    for attempt in range(max_retries):
        try:
            response = func(*args)

            # Success
            if response.statusCode < 300:
                return response

            # Don't retry client errors (4xx)
            if 400 <= response.statusCode < 500:
                raise ValueError(f"Client error {response.statusCode}: {response.text()}")

            # Retry server errors (5xx)
            last_exception = Exception(f"Server error {response.statusCode}")

        except Exception as e:
            last_exception = e

        # Don't sleep after last attempt
        if attempt < max_retries - 1:
            time.sleep(delay)
            delay *= 2  # Exponential backoff

    raise Exception(f"API call failed after {max_retries} attempts") from last_exception

# Usage
def fetchDataSafely(cls, userId):
    return cls.callWithRetry(c3.MyApi.getUserData, userId, max_retries=3)
```

### Timeout Handling

**Note:** REST mixin doesn't have built-in timeout configuration. You can implement timeout logic in wrapper functions:

```javascript
function callWithTimeout(apiFunc, params, timeoutMs) {
  const startTime = DateTime.now();

  try {
    const response = apiFunc(...params);
    const elapsed = DateTime.deltaMillis(startTime, DateTime.now());

    if (elapsed > timeoutMs) {
      throw new Error('Request timed out after ' + elapsed + 'ms');
    }

    return response;
  } catch (e) {
    const elapsed = DateTime.deltaMillis(startTime, DateTime.now());
    if (elapsed > timeoutMs) {
      throw new Error('Request timed out: ' + e.message);
    }
    throw e;
  }
}
```

---

## Rate Limiting

### Handling Rate Limit Responses

```python
def handleRateLimitedCall(cls, func, *args):
    """
    Handle API rate limiting with Retry-After header
    """
    response = func(*args)

    if response.statusCode == 429:  # Too Many Requests
        retry_after = response.headers.get('Retry-After')
        if retry_after:
            wait_seconds = int(retry_after)
            # Log or throw error with wait time
            raise Exception(f"Rate limited. Retry after {wait_seconds} seconds")
        else:
            raise Exception("Rate limited. No Retry-After header provided")

    return response
```

---

## Pagination

### Offset-Based Pagination

```c3typ
type ApiClient mixes REST {
  @rest(uri='items', method='GET')
  getItems: abstract function(limit: int, offset: int): json

  // Helper method for fetching all items with pagination
  fetchAllItems: function(pageSize: int): [json] py
}
```

```python
def fetchAllItems(cls, page_size=100):
    """
    Fetch all items using offset-based pagination
    """
    all_items = []
    offset = 0

    while True:
        response = c3.ApiClient.getItems(limit=page_size, offset=offset)
        items = response.get('items', [])

        if not items:
            break

        all_items.extend(items)
        offset += page_size

        # Check if we've reached the end
        total = response.get('total')
        if total and offset >= total:
            break

    return all_items
```

### Cursor-Based Pagination

```c3typ
type ApiClient mixes REST {
  @rest(uri='items', method='GET')
  getItems: abstract function(limit: int, cursor: string): json
}
```

```javascript
function fetchAllItems(pageSize) {
  pageSize = pageSize || 100;
  const allItems = [];
  var cursor = null;

  while (true) {
    const response = ApiClient.getItems(pageSize, cursor);
    const items = response.items || [];

    if (items.length === 0) {
      break;
    }

    allItems.push(...items);

    cursor = response.nextCursor;
    if (!cursor) {
      break; // No more pages
    }
  }

  return allItems;
}
```

### Link Header Pagination (GitHub-style)

```javascript
function parseLinks(linkHeader) {
  const links = {};
  const parts = linkHeader.split(',');

  parts.forEach(function (part) {
    const section = part.split(';');
    const url = section[0].replace(/<(.*)>/, '$1').trim();
    const name = section[1].replace(/rel="(.*)"/, '$1').trim();
    links[name] = url;
  });

  return links;
}

function fetchAllPages(initialUrl) {
  const allItems = [];
  var nextUrl = initialUrl;

  while (nextUrl) {
    // You'd need a more generic REST call here or parse the URL
    const response = ApiClient.callGenericEndpoint(nextUrl);

    allItems.push(...response.json());

    const linkHeader = response.headers.Link;
    if (linkHeader) {
      const links = parseLinks(linkHeader);
      nextUrl = links.next || null;
    } else {
      nextUrl = null;
    }
  }

  return allItems;
}
```

---

## Caching Responses

### Simple Cache Pattern

```c3typ
type CachedApiResponse {
  cacheKey: !string
  data: json
  cachedAt: datetime
  ttlMinutes: int = 60
}

// Service type with caching utilities
type CacheService {
  fetchWithCache: function(cacheKey: string, fetchFunc: function(): json, ttlMinutes: int): json py
  getUserData: function(userId: string): json py
}
```

```python
def fetchWithCache(cls, cache_key, fetch_func, ttl_minutes=60):
    """
    Fetch data with caching

    Args:
        cache_key: Unique key for this cached item
        fetch_func: Function to call if cache miss
        ttl_minutes: Time to live in minutes
    """
    # Try to get from cache
    cached = c3.CachedApiResponse.fetch({
        "filter": c3.Filter.eq("cacheKey", cache_key),
        "limit": 1
    }).objs

    if cached:
        cached_item = cached[0]
        age_ms = c3.DateTime.deltaMillis(cached_item.cachedAt, c3.DateTime.now())
        age_minutes = age_ms / (1000 * 60)

        # Return cached if still valid
        if age_minutes < ttl_minutes:
            return cached_item.data

    # Cache miss or expired - fetch fresh data
    fresh_data = fetch_func()

    # Store in cache
    c3.CachedApiResponse.make({
        "cacheKey": cache_key,
        "data": fresh_data,
        "cachedAt": c3.DateTime.now(),
        "ttlMinutes": ttl_minutes
    }).upsert()

    return fresh_data

# Usage
def getUserData(cls, user_id):
    cache_key = f"user_{user_id}"
    return cls.fetchWithCache(
        cache_key,
        lambda: c3.MyApi.getUser(user_id),
        ttl_minutes=30
    )
```

---

## Webhook Handling

### Receiving Webhook Events

**Note:** This would typically be done via a `@restful` endpoint (server-side), not a REST client. But you can use REST clients to register webhooks:

```c3typ
type WebhookApi mixes REST {
  @rest(uri='webhooks', method='POST')
  registerWebhook: abstract function(
    @rest(header=true, headerName='Authorization') auth: string,
    url: string,
    events: [string]
  ): json

  @rest(uri='webhooks/', method='DELETE')
  unregisterWebhook: abstract function(
    @rest(header=true, headerName='Authorization') auth: string,
    @rest(partOfURI=true) webhookId: string
  ): json

  // Helper methods
  getAuthToken: function(): string py
  setupWebhook: function(callbackUrl: string, events: [string]): string py
}
```

```python
def setupWebhook(cls, callback_url, events):
    """
    Register a webhook with the external service
    """
    token = cls.getAuthToken()

    response = c3.WebhookApi.registerWebhook(
        auth=f"Bearer {token}",
        url=callback_url,
        events=events
    )

    if response.statusCode == 201:
        webhook_data = response.json()
        return webhook_data['id']
    else:
        raise Exception(f"Failed to register webhook: {response.statusCode}")
```

---

## GraphQL APIs

GraphQL APIs can be called using REST clients with POST requests:

```c3typ
type GraphQLApi mixes REST {
  @rest(uri='graphql', method='POST', contentType='application/json')
  query: abstract function(query: !string, variables: json): json

  // Helper methods
  fetchUserData: function(userId: string): json js
  fetchRepositoryData: function(owner: string, repo: string): json py
}
```

```javascript
function fetchUserData(userId) {
  const query = `
    query GetUser($userId: ID!) {
      user(id: $userId) {
        id
        name
        email
        posts {
          id
          title
        }
      }
    }
  `;

  const variables = { userId: userId };

  GraphQLApi.setApiUrlAndAuth('https://api.example.com/', 'Bearer ' + token);
  const response = GraphQLApi.query(query, variables);

  if (response.errors) {
    throw new Error('GraphQL errors: ' + JSON.stringify(response.errors));
  }

  return response.data.user;
}
```

```python
def fetchRepositoryData(cls, owner, repo):
    """
    Fetch GitHub repository data using GraphQL
    """
    query = """
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        name
        description
        stargazerCount
        forkCount
        issues(first: 10, states: OPEN) {
          nodes {
            title
            createdAt
          }
        }
      }
    }
    """

    variables = {
        "owner": owner,
        "repo": repo
    }

    response = c3.GitHubGraphQLApi.query(query, variables)

    if 'errors' in response:
        raise Exception(f"GraphQL errors: {response['errors']}")

    return response['data']['repository']
```

---

## File Upload/Download

### File Upload (Multipart Form Data)

```c3typ
type FileApi mixes REST {
  @rest(uri='upload', method='POST', contentType='multipart/form-data')
  uploadFile: abstract function(
    @rest(header=true, headerName='Authorization') auth: string,
    file: binary,
    filename: string,
    description: string
  ): json
}
```

**Note:** Binary file handling may require special handling in C3. Check platform documentation for binary type support.

### File Download

```c3typ
type FileApi mixes REST {
  @rest(uri='files/', method='GET')
  downloadFile: abstract function(
    @rest(partOfURI=true) fileId: string
  ): binary

  // Helper method
  downloadAndSaveFile: function(fileId: string, savePath: string): string py
}
```

```python
def downloadAndSaveFile(cls, file_id, save_path):
    """
    Download a file and save it locally
    """
    file_content = c3.FileApi.downloadFile(file_id)

    # Save to local file system or C3 storage
    # Implementation depends on platform capabilities
    with open(save_path, 'wb') as f:
        f.write(file_content)

    return save_path
```

---

## Streaming Responses

For Server-Sent Events (SSE) or streaming responses, the REST mixin may have limitations. You might need to:

1. Use response chunks if supported
2. Poll an endpoint repeatedly
3. Use WebSockets (separate protocol)

### Polling Pattern

```javascript
function pollForCompletion(jobId, maxAttempts, delayMs) {
  maxAttempts = maxAttempts || 60;
  delayMs = delayMs || 5000;

  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    const response = JobApi.getJobStatus(jobId);

    if (response.status === 'completed') {
      return response.result;
    } else if (response.status === 'failed') {
      throw new Error('Job failed: ' + response.error);
    }

    // Sleep between attempts (pseudo-code, actual implementation varies)
    // In JavaScript, you'd need async/await or callbacks
    Thread.sleep(delayMs);
  }

  throw new Error('Job did not complete within timeout');
}
```

---

## Best Practices Summary

### 1. Always Check Status Codes

```javascript
const response = MyApi.callEndpoint(param);
if (response.statusCode !== 200) {
  throw new Error('API error: ' + response.statusCode);
}
```

### 2. Handle Common HTTP Status Codes

- **200-299**: Success
- **400**: Bad Request (client error)
- **401**: Unauthorized (auth required)
- **403**: Forbidden (no permission)
- **404**: Not Found
- **429**: Too Many Requests (rate limited)
- **500-599**: Server Error (retry)

### 3. Implement Retry Logic for Server Errors

Only retry on:

- **5xx** errors (server errors)
- **Network timeouts**

Do NOT retry on:

- **4xx** errors (client errors)
- **Authentication failures**

### 4. Use Exponential Backoff

Wait longer between each retry: 1s, 2s, 4s, 8s, etc.

### 5. Cache When Appropriate

Cache data that:

- Changes infrequently
- Is expensive to fetch
- Can tolerate some staleness

### 6. Handle Pagination Properly

Always use pagination for:

- Large datasets
- List endpoints
- Search results

### 7. Respect Rate Limits

- Check for `Retry-After` headers
- Handle 429 (Too Many Requests) status codes gracefully
- Use batch endpoints when available

### 8. Log API Calls

Log:

- Request parameters
- Response status codes
- Errors and exceptions
- Timing information

### 9. Secure Credentials

- Store in `@config(secret=true)` fields
- Never log tokens or secrets
- Rotate tokens regularly
- Use shortest-lived tokens possible

### 10. Test with Real APIs

Use test endpoints like:

- JSONPlaceholder (https://jsonplaceholder.typicode.com/)
- httpbin (https://httpbin.org/)
- Mock APIs

---

## Common Pitfalls to Avoid

1. **Not checking status codes** - Always validate responses
2. **Retrying client errors (4xx)** - These won't succeed on retry
3. **Ignoring rate limits** - Check for 429 status codes and Retry-After headers
4. **Fetching all data at once** - Use pagination
5. **Hardcoding credentials** - Use Config types
6. **Ignoring token expiration** - Implement refresh logic
7. **No error handling** - Wrap calls in try-catch
8. **Not using caching** - Can waste API quota
9. **Synchronous blocking calls** - Consider async patterns where available
10. **Not testing with real APIs** - Test early with actual endpoints

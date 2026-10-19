# REST Client Authentication Patterns

This document demonstrates various authentication patterns for REST clients in C3 AI Platform.

## Pattern 1: No Authentication (Public APIs)

For public APIs like JSONPlaceholder that don't require authentication:

```python
# Simply set the base URL with empty auth string
JsonPlaceholderApi.setApiUrlAndAuth("https://jsonplaceholder.typicode.com/", "")

# Now make calls
posts = JsonPlaceholderApi.getAllPosts()
```

## Pattern 2: Bearer Token Authentication

### Configuration Type

```c3typ
type MyApiConfig mixes Config, Singleton {
  @config
  baseUrl: !string = "https://api.example.com/"

  @config(secret=true)
  apiToken: string
}
```

### REST Type with Helper Methods

```c3typ
type MyApi mixes REST {
  // REST endpoint (abstract - no implementation needed)
  @rest(uri='endpoint', method='GET')
  getData: abstract function(): json

  // Helper methods (require implementation)
  initialize: function() py
  fetchData: function(): json py
}
```

### Python Implementation (MyApi.py)

```python
def initialize(cls):
    """Initialize the REST client with Bearer token authentication"""
    config = c3.MyApiConfig.getConfig()
    base_url = config.baseUrl
    token = config.getSecret().apiToken

    # Set Bearer token
    cls.setApiUrlAndAuth(base_url, "Bearer " + token)

def fetchData(cls):
    """Fetch data using the authenticated client"""
    cls.initialize()
    return c3.MyApi.getData()
```

### JavaScript Version

For JavaScript implementation, declare with `js` instead:

```c3typ
type MyApi mixes REST {
  @rest(uri='endpoint', method='GET')
  getData: abstract function(): json

  initialize: function() js
  fetchData: function(): json js
}
```

### JavaScript Implementation (MyApi.js)

```javascript
function initialize() {
  const config = MyApiConfig.getConfig();
  const baseUrl = config.configValue('baseUrl');
  const token = config.secretValue('apiToken');

  // Set Bearer token
  MyApi.setApiUrlAndAuth(baseUrl, 'Bearer ' + token);
}

function fetchData() {
  initialize();
  return MyApi.getData();
}
```

## Pattern 3: API Key in Header

### REST Type with Header Parameter

```c3typ
type MyApi mixes REST {
  // REST endpoint with API key in header
  @rest(uri='data', method='GET')
  getData: abstract function(
    @rest(header=true, headerName='X-API-Key') apiKey: !string
  ): json

  // Helper method (if needed)
  fetchData: function(): json py
}
```

### Python Implementation (MyApi.py)

```python
def fetchData(cls):
    config = c3.MyApiConfig.getConfig()
    api_key = config.getSecret().apiKey

    # Set base URL (no auth in setApiUrlAndAuth since it's in header)
    c3.MyApi.setApiUrlAndAuth("https://api.example.com/", "")

    # Pass API key as parameter
    return c3.MyApi.getData(api_key)
```

## Pattern 4: Custom Authorization Header

### REST Type

```c3typ
type MyApi mixes REST {
  // REST endpoint with custom authorization header
  @rest(uri='data', method='GET')
  getData: abstract function(
    @rest(header=true, headerName='Authorization') authorization: !string
  ): json

  // Helper method
  fetchData: function(): json py
}
```

### Python Implementation (MyApi.py)

```python
def fetchData(cls):
    config = c3.MyApiConfig.getConfig()
    api_key = config.getSecret().apiKey

    c3.MyApi.setApiUrlAndAuth("https://api.example.com/", "")

    # Build custom authorization header
    auth_header = "Token " + api_key  # Or "ApiKey " + api_key, etc.
    return c3.MyApi.getData(auth_header)
```

## Pattern 5: OAuth2 with Token Refresh

### Configuration Type

```c3typ
type OAuth2Config mixes Config, Singleton {
  @config
  tokenUrl: !string = "https://api.example.com/oauth/token"

  @config
  baseUrl: !string = "https://api.example.com/"

  @config(secret=true)
  clientId: !string

  @config(secret=true)
  clientSecret: !string

  @config(secret=true)
  accessToken: string

  @config
  tokenType: string = "Bearer"

  @config
  tokenCreatedOn: datetime

  @config
  tokenDurationMins: int = 60
}
```

### REST Types

```c3typ
// OAuth token endpoint (declarative only)
type OAuth2TokenApi mixes REST {
  @rest(uri='oauth/token', method='POST', contentType='application/json')
  authenticate: abstract function(
    client_id: !string,
    client_secret: !string,
    grant_type: string = 'client_credentials'
  ): HttpResponse
}

// Main API with helper methods
type MyApi mixes REST {
  // REST endpoint
  @rest(uri='data', method='GET')
  getData: abstract function(): json

  // Helper methods for token management
  isPreviousTokenExpired: function(config: OAuth2Config): boolean js
  getAccessToken: function(): string js
  fetchData: function(): json js
}
```

### JavaScript Implementation (MyApi.js)

```javascript
function isPreviousTokenExpired(config) {
  const accessToken = config.secretValue('accessToken');
  const tokenCreatedOn = config.configValue('tokenCreatedOn');
  const tokenDurationMins = config.configValue('tokenDurationMins');

  if (!tokenDurationMins) {
    throw new Error('Token duration configuration is missing');
  }

  if (!accessToken || !tokenCreatedOn) {
    return true; // Treat missing token as expired
  }

  const tokenAge = DateTime.deltaMillis(tokenCreatedOn, DateTime.nowWithMillis());
  return tokenAge > tokenDurationMins * 60 * 1000;
}

function getAccessToken() {
  const config = OAuth2Config.getConfig();

  // Return cached token if not expired
  if (!isPreviousTokenExpired(config)) {
    return config.secretValue('accessToken');
  }

  // Get new token
  const clientId = config.configValue('clientId');
  const clientSecret = config.secretValue('clientSecret');
  const tokenUrl = config.configValue('tokenUrl');

  OAuth2TokenApi.setApiUrlAndAuth(tokenUrl, '');
  const response = OAuth2TokenApi.authenticate(clientId, clientSecret);

  if (response.statusCode === 200) {
    const data = response.json();

    // Store new token
    config.setSecretValue('accessToken', data.access_token);
    config.setConfigValue('tokenType', data.token_type || 'Bearer');
    config.setConfigValue('tokenCreatedOn', DateTime.nowWithMillis());

    return data.access_token;
  }

  throw new Error('Authentication failed: ' + response.statusCode);
}

function fetchData() {
  const config = OAuth2Config.getConfig();
  const accessToken = getAccessToken();
  const tokenType = config.configValue('tokenType');

  MyApi.setApiUrlAndAuth(config.configValue('baseUrl'), tokenType + ' ' + accessToken);

  return MyApi.getData();
}
```

### Python Version

For Python implementation:

```c3typ
type MyApi mixes REST {
  @rest(uri='data', method='GET')
  getData: abstract function(): json

  isPreviousTokenExpired: function(config: OAuth2Config): boolean py
  getAccessToken: function(): string py
  fetchData: function(): json py
}
```

### Python Implementation (MyApi.py)

```python
def isPreviousTokenExpired(config):
    access_token = config.getSecret().accessToken
    token_created_on = config.tokenCreatedOn
    token_duration_mins = config.tokenDurationMins

    if not token_duration_mins:
        raise ValueError('Token duration configuration is missing')

    if not access_token or not token_created_on:
        return True

    token_age = c3.DateTime.deltaMillis(token_created_on, c3.DateTime.nowWithMillis())
    return token_age > token_duration_mins * 60 * 1000

def getAccessToken(cls):
    config = c3.OAuth2Config.getConfig()

    # Return cached token if not expired
    if not cls.isPreviousTokenExpired(config):
        return config.getSecret().accessToken

    # Get new token
    client_id = config.clientId
    client_secret = config.getSecret().clientSecret
    token_url = config.tokenUrl

    c3.OAuth2TokenApi.setApiUrlAndAuth(token_url, '')
    response = c3.OAuth2TokenApi.authenticate(client_id, client_secret)

    if response.statusCode == 200:
        data = response.json()

        # Store new token (requires privileged action or proper permissions)
        config.getSecret().accessToken = data['access_token']
        config.tokenType = data.get('token_type', 'Bearer')
        config.tokenCreatedOn = c3.DateTime.nowWithMillis()
        config.merge()

        return data['access_token']

    raise ValueError(f'Authentication failed: {response.statusCode}')

def fetchData(cls):
    config = c3.OAuth2Config.getConfig()
    access_token = cls.getAccessToken()
    token_type = config.tokenType

    c3.MyApi.setApiUrlAndAuth(
        config.baseUrl,
        f"{token_type} {access_token}"
    )

    return c3.MyApi.getData()
```

## Pattern 6: Multiple Custom Headers

### REST Type

```c3typ
type MyApi mixes REST {
  // REST endpoint with multiple custom headers
  @rest(uri='data', method='POST', contentType='application/json')
  postData: abstract function(
    @rest(header=true, headerName='Authorization') authorization: !string,
    @rest(header=true, headerName='X-Request-ID') requestId: !string,
    @rest(header=true, headerName='X-Environment') environment: string,
    payload: !json
  ): json

  // Helper method (if needed)
  sendData: function(data: json): json py
}
```

### Python Implementation (MyApi.py)

```python
def sendData(cls, data):
    config = c3.MyApiConfig.getConfig()
    token = config.getSecret().apiToken

    c3.MyApi.setApiUrlAndAuth("https://api.example.com/", "")

    return c3.MyApi.postData(
        authorization=f"Bearer {token}",
        requestId=str(c3.UUID.randomUUID()),
        environment="production",
        payload=data
    )
```

## Summary: Which Pattern to Use?

| Use Case             | Pattern   | Key Feature                          |
| -------------------- | --------- | ------------------------------------ |
| Public API (no auth) | Pattern 1 | Empty auth string                    |
| Simple Bearer token  | Pattern 2 | Token in `setApiUrlAndAuth()`        |
| API key in header    | Pattern 3 | `@rest(header=true)` parameter       |
| Custom auth header   | Pattern 4 | Custom header name                   |
| OAuth2 with refresh  | Pattern 5 | Token lifecycle management           |
| Multiple headers     | Pattern 6 | Multiple `@rest(header=true)` params |

## Best Practices

1. **Always use Config types with `@config(secret=true)`** for sensitive data (tokens, keys, secrets)
2. **Initialize once** - Call `setApiUrlAndAuth()` before making API calls
3. **Handle token expiration** - Implement refresh logic for OAuth2
4. **Check response status codes** - Use `HttpResponse.statusCode` to validate responses
5. **Use secrets properly** - Access via `config.getSecret().fieldName` in Python or `config.secretValue('fieldName')` in JavaScript

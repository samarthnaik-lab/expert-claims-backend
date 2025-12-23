# Customer Portal API - Curl Commands & Frontend Examples

## Base URL
```
http://localhost:3000
```

---

## 1. Get User ID from Session
**Endpoint:** `GET /customer/getuserid`  
**Purpose:** Extract user_id from JWT token or session_id header

### Curl Command
```bash
curl -X GET "http://localhost:3000/customer/getuserid" \
  -H "jwt_token: YOUR_JWT_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

**OR with session_id:**
```bash
curl -X GET "http://localhost:3000/customer/getuserid" \
  -H "session_id: YOUR_SESSION_ID_HERE" \
  -H "Content-Type: application/json"
```

**OR with Authorization Bearer:**
```bash
curl -X GET "http://localhost:3000/customer/getuserid" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

### Response
```json
{
  "status": "success",
  "user_id": 1,
  "userId": "1"
}
```

### Frontend JavaScript Example
```javascript
// Get user_id from session
async function getUserId() {
  const jwtToken = localStorage.getItem('jwtToken'); // or sessionStorage
  const sessionId = localStorage.getItem('sessionId');
  
  const response = await fetch('http://localhost:3000/customer/getuserid', {
    method: 'GET',
    headers: {
      'jwt_token': jwtToken,  // Use jwt_token OR session_id
      // OR 'session_id': sessionId,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  return data.user_id || data.userId;
}
```

---

## 2. Customer Dashboard API
**Endpoint:** `POST /customer/customer-dashboard`  
**Purpose:** Get customer dashboard data with cases summary  
**Note:** `user_id` is automatically extracted from `jwt_token` or `session_id` headers. You can also provide it in the body.

### Curl Command (Recommended - using headers)
```bash
curl -X POST "http://localhost:3000/customer/customer-dashboard" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "jwt_token: YOUR_JWT_TOKEN_HERE"
```

**OR with session_id:**
```bash
curl -X POST "http://localhost:3000/customer/customer-dashboard" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "session_id: YOUR_SESSION_ID_HERE"
```

**OR with user_id in body (fallback):**
```bash
curl -X POST "http://localhost:3000/customer/customer-dashboard" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "user_id=1"
```

### Payload (Form Data) - Optional
```
user_id=1
```
**Note:** If `jwt_token` or `session_id` header is provided, `user_id` in body is optional.

### Frontend JavaScript Example
```javascript
// Recommended: user_id automatically extracted from jwt_token header
async function getCustomerDashboard() {
  const response = await fetch('http://localhost:3000/customer/customer-dashboard', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'jwt_token': localStorage.getItem('jwtToken') // user_id extracted from this
    },
    body: '' // Empty body - user_id comes from header
  });
  
  return await response.json();
}

// Alternative: Using session_id header
async function getCustomerDashboard() {
  const response = await fetch('http://localhost:3000/customer/customer-dashboard', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'session_id': localStorage.getItem('sessionId') // user_id extracted from this
    },
    body: ''
  });
  
  return await response.json();
}

// Fallback: Provide user_id in body (if headers not available)
async function getCustomerDashboard(userId) {
  const params = new URLSearchParams();
  params.append('user_id', userId);
  
  const response = await fetch('http://localhost:3000/customer/customer-dashboard', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  
  return await response.json();
}
```

### Response Example
```json
{
  "totalTasks": 5,
  "Newtask": 3,
  "reviewCounts": 3,
  "completedCounts": 1,
  "cancelledCounts": 1,
  "summary": {
    "totalClaims": 5,
    "underReview": 3,
    "approved": 1,
    "rejected": 1
  },
  "claims": [
    {
      "case_id": 1,
      "case_summary": "...",
      "ticket_stage": "Under Evaluation",
      "status": "Under Review",
      ...
    }
  ]
}
```

---

## 3. Customer Cases API
**Endpoint:** `POST /customer/customer-case`  
**Purpose:** Get customer cases with pagination  
**Note:** `user_id` is automatically extracted from `jwt_token` or `session_id` headers. You can also provide it in the body.

### Curl Command (Recommended - using headers)
```bash
curl -X POST "http://localhost:3000/customer/customer-case" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "jwt_token: YOUR_JWT_TOKEN_HERE" \
  -d "page=1&size=10"
```

**OR with session_id:**
```bash
curl -X POST "http://localhost:3000/customer/customer-case" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "session_id: YOUR_SESSION_ID_HERE" \
  -d "page=1&size=10"
```

**OR with user_id in body (fallback):**
```bash
curl -X POST "http://localhost:3000/customer/customer-case" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "user_id=1&page=1&size=10"
```

### Payload (Form Data)
```
page=1&size=10
```
**Note:** If `jwt_token` or `session_id` header is provided, `user_id` in body is optional. `page` and `size` are still required.

### Frontend JavaScript Example
```javascript
// Recommended: user_id automatically extracted from jwt_token header
async function getCustomerCases(page = 1, size = 10) {
  const params = new URLSearchParams();
  params.append('page', page.toString());
  params.append('size', size.toString());
  
  const response = await fetch('http://localhost:3000/customer/customer-case', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'jwt_token': localStorage.getItem('jwtToken') // user_id extracted from this
    },
    body: params.toString()
  });
  
  return await response.json();
}

// Alternative: Using session_id header
async function getCustomerCases(page = 1, size = 10) {
  const params = new URLSearchParams();
  params.append('page', page.toString());
  params.append('size', size.toString());
  
  const response = await fetch('http://localhost:3000/customer/customer-case', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'session_id': localStorage.getItem('sessionId') // user_id extracted from this
    },
    body: params.toString()
  });
  
  return await response.json();
}

// Fallback: Provide user_id in body (if headers not available)
async function getCustomerCases(userId, page = 1, size = 10) {
  const params = new URLSearchParams();
  params.append('user_id', userId);
  params.append('page', page.toString());
  params.append('size', size.toString());
  
  const response = await fetch('http://localhost:3000/customer/customer-case', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  
  return await response.json();
}

// Usage (no need to pass userId if jwt_token is in headers)
const cases = await getCustomerCases(1, 10); // page=1, size=10
```

### Response Example
```json
[
  {
    "case_id": 1,
    "case_summary": "Insurance claim for vehicle damage",
    "case_description": "...",
    "ticket_stage": "Under Evaluation",
    "case_types": {
      "case_type_name": "Motor Insurance"
    },
    "assigned_agent": "John Doe",
    "created_time": "2024-01-15T10:30:00Z",
    "priority": "High",
    "case_value": 50000,
    "value_currency": "INR",
    "customer_id": 1,
    "assigned_to": 5
  }
]
```

---

## 4. Complete Frontend Flow Example

```javascript
// Complete example: Login -> Get User ID -> Get Dashboard -> Get Cases

class CustomerAPI {
  constructor(baseURL = 'http://localhost:3000') {
    this.baseURL = baseURL;
  }

  // Store tokens after login
  setTokens(jwtToken, sessionId, userId) {
    localStorage.setItem('jwtToken', jwtToken);
    localStorage.setItem('sessionId', sessionId);
    localStorage.setItem('userId', userId);
  }

  // Get headers with authentication
  getHeaders() {
    return {
      'Content-Type': 'application/x-www-form-urlencoded',
      'jwt_token': localStorage.getItem('jwtToken') || '',
      'session_id': localStorage.getItem('sessionId') || ''
    };
  }

  // Get user_id from session (if not stored)
  async getUserId() {
    const response = await fetch(`${this.baseURL}/customer/getuserid`, {
      method: 'GET',
      headers: {
        'jwt_token': localStorage.getItem('jwtToken'),
        'session_id': localStorage.getItem('sessionId')
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to get user ID');
    }
    
    const data = await response.json();
    const userId = data.user_id || data.userId;
    
    // Store for future use
    localStorage.setItem('userId', userId);
    
    return userId;
  }

  // Get dashboard data (user_id automatically extracted from headers)
  async getDashboard() {
    const response = await fetch(`${this.baseURL}/customer/customer-dashboard`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: '' // Empty body - user_id comes from jwt_token/session_id header
    });

    if (!response.ok) {
      throw new Error('Failed to get dashboard data');
    }

    return await response.json();
  }

  // Get cases with pagination (user_id automatically extracted from headers)
  async getCases(page = 1, size = 10) {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('size', size.toString());

    const response = await fetch(`${this.baseURL}/customer/customer-case`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: params.toString() // user_id comes from jwt_token/session_id header
    });

    if (!response.ok) {
      throw new Error('Failed to get cases');
    }

    return await response.json();
  }
}

// Usage Example
const api = new CustomerAPI();

// After login, store tokens (user_id is automatically extracted from these)
api.setTokens(jwtToken, sessionId, userId);

// Get dashboard (no need to pass userId - extracted from jwt_token header)
try {
  const dashboard = await api.getDashboard();
  console.log('Dashboard:', dashboard);
} catch (error) {
  console.error('Error:', error);
}

// Get cases (no need to pass userId - extracted from jwt_token header)
try {
  const cases = await api.getCases(1, 10); // page=1, size=10
  console.log('Cases:', cases);
} catch (error) {
  console.error('Error:', error);
}
```

---

## 5. Customer Login (Reference)
**Endpoint:** `POST /api/customer/login`

### Curl Command
```bash
curl -X POST "http://localhost:3000/api/customer/login" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+919876543210",
    "otp": "1234",
    "step": "verify_otp"
  }'
```

### Response
```json
{
  "status": "success",
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "token": "eyJhbGci...",
  "jwtToken": "eyJhbGci...",
  "session_id": "abc-123-def",
  "sessionId": "abc-123-def",
  "userId": "1",
  "userRole": "customer",
  "expiry": "2024-01-15T13:30:00.000Z",
  "expiresAt": 1705327800000,
  "expiresIn": 10800
}
```

### Frontend Login Example
```javascript
async function customerLogin(phoneNumber, otp) {
  const response = await fetch('http://localhost:3000/api/customer/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phone_number: phoneNumber,
      otp: otp,
      step: 'verify_otp'
    })
  });

  const data = await response.json();
  
  if (data.success) {
    // Store tokens and user info
    localStorage.setItem('jwtToken', data.jwtToken);
    localStorage.setItem('sessionId', data.sessionId);
    localStorage.setItem('userId', data.userId);
    
    return data;
  } else {
    throw new Error(data.message || 'Login failed');
  }
}
```

---

## 6. Error Handling

### Common Errors

**400 Bad Request - Missing user_id:**
```json
{
  "status": "error",
  "message": "user_id is required in form-data body",
  "statusCode": 400
}
```

**401 Unauthorized - Invalid session:**
```json
{
  "status": "error",
  "message": "Could not extract user_id from session. Provide jwt_token or session_id in headers.",
  "statusCode": 401
}
```

**404 Not Found - User not found:**
```json
{
  "status": "error",
  "message": "User not found",
  "statusCode": 404
}
```

### Frontend Error Handling Example
```javascript
async function safeApiCall(apiFunction) {
  try {
    const result = await apiFunction();
    return { success: true, data: result };
  } catch (error) {
    console.error('API Error:', error);
    
    if (error.response) {
      const errorData = await error.response.json();
      return {
        success: false,
        error: errorData.message || 'API request failed',
        statusCode: error.response.status
      };
    }
    
    return {
      success: false,
      error: error.message || 'Network error'
    };
  }
}

// Usage
const result = await safeApiCall(() => api.getDashboard());
if (result.success) {
  console.log('Dashboard data:', result.data);
} else {
  console.error('Error:', result.error);
}
```

---

## Summary

### Required Headers (Optional but Recommended)
- `jwt_token`: JWT token from login response
- `session_id`: Session ID from login response

### Required Payload Format
- Content-Type: `application/x-www-form-urlencoded`
- Body: `user_id=1` (for dashboard) or `user_id=1&page=1&size=10` (for cases)

### Key Points
1. **user_id** is automatically extracted from `jwt_token` or `session_id` headers (recommended)
2. **user_id** can also be provided in the request body as a fallback
3. You can get **user_id** from:
   - Login response (`userId` field) - but not needed if using headers
   - `/customer/getuserid` endpoint (using jwt_token or session_id header)
   - localStorage (if stored after login) - but not needed if using headers
4. Headers (`jwt_token`, `session_id`) are now the primary way to authenticate
5. All customer APIs use `POST` method with form-data body
6. **No need to hardcode user_id=1** - it's automatically extracted from your session!


# Admin Login Workflow - Backend API Guide

## Overview
The admin login follows a **3-step sequential process**:
1. **Credential Validation** - Verify email and password
2. **OTP Generation** - Generate and send OTP to email
3. **OTP Verification & Session Creation** - Verify OTP and create JWT session

## API Endpoint
All steps use the same endpoint: `POST /api/login`

## Step-by-Step Workflow

### Step 1: Validate Credentials
**Request:**
```json
{
  "email": "admin@company.com",
  "password": "password123",
  "role": "admin"
}
```
**Note:** Do NOT include `otp` or `step` fields in this request.

**Response (Success):**
```json
{
  "success": true,
  "message": "Credentials validated successfully. Please request OTP.",
  "statusCode": 200,
  "nextStep": "send_otp",
  "requiresOtp": true
}
```

**Response (Failure):**
```json
{
  "success": false,
  "message": "Invalid credentials",
  "statusCode": 401,
  "nextStep": null
}
```

**Frontend Action:** 
- If success: Show OTP input field and "Send OTP" button
- If failure: Show error message, keep OTP field hidden

---

### Step 2: Generate and Send OTP
**Request:**
```json
{
  "email": "admin@company.com",
  "password": "password123",
  "role": "admin",
  "step": "send_otp"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "OTP sent to email admin@company.com",
  "otp": "123456",  // ⚠️ TEMPORARY: For development only - remove in production
  "contactType": "email",
  "contactInfo": "admin@company.com",
  "expiresAt": "2025-12-17T16:05:00.000Z",
  "nextStep": "final_login",
  "requiresOtp": true
}
```

**Response (Failure):**
```json
{
  "success": false,
  "message": "Invalid credentials" or "Failed to send OTP",
  "statusCode": 401 or 500
}
```

**Frontend Action:**
- Display OTP field (if not already shown)
- Show success message: "OTP sent to email"
- Display the OTP value for testing (remove in production)
- Enable "Sign In" button

---

### Step 3: Verify OTP and Create Session
**Request:**
```json
{
  "email": "admin@company.com",
  "password": "password123",
  "role": "admin",
  "otp": "123456",
  "step": "final_login"
}
```

**Response (Success):**
```json
{
  "status": "success",
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "jwtToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "sessionId": "uuid-session-id",
  "userId": "1",
  "userRole": "admin",
  "expiresAt": 1734441900000,  // Unix timestamp (milliseconds)
  "expiry": "2025-12-17T15:45:00.000Z",  // ISO string
  "expiresIn": 10800,  // Seconds until expiry (3 hours)
  "expiresAtFormatted": "12/17/2025, 3:45:00 PM"  // Human-readable
}
```

**Response (Failure - Invalid OTP):**
```json
{
  "success": false,
  "message": "Invalid OTP",
  "statusCode": 401
}
```

**Frontend Action:**
- Store JWT token and session data
- Redirect to dashboard
- Display session expiry time in top right corner

---

## Frontend Implementation Guide

### Recommended UI Flow:

1. **Initial State:**
   - Show: Email, Password fields, "Sign In" button
   - Hide: OTP field

2. **After Step 1 (Credential Validation Success):**
   - Show: OTP field appears
   - Show: "Send OTP" button (or auto-trigger Step 2)
   - Hide: "Sign In" button (or disable it)

3. **After Step 2 (OTP Sent):**
   - Show: OTP field (pre-filled with OTP for testing)
   - Show: "Sign In" button (enabled)
   - Show: Success message "OTP sent to email"

4. **After Step 3 (Login Success):**
   - Store session data
   - Display session expiry in top right: `expiresAtFormatted` or countdown using `expiresIn`
   - Redirect to dashboard

### Session Expiry Display Options:

**Option 1: Static Display**
```javascript
// Display: "Session expires: 12/17/2025, 3:45:00 PM"
const expiryText = response.expiresAtFormatted;
```

**Option 2: Countdown Timer**
```javascript
// Display: "Session expires in: 2h 59m 45s"
const expiresInSeconds = response.expiresIn;
// Update every second: expiresInSeconds--
```

**Option 3: Both**
```javascript
// Display: "Session expires: 12/17/2025, 3:45:00 PM (in 2h 59m)"
```

---

## Error Handling

All error responses follow this format:
```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400|401|500,
  "nextStep": null  // or "send_otp" or "final_login"
}
```

**Common Errors:**
- `400`: Missing required fields
- `401`: Invalid credentials or invalid OTP
- `500`: Server error (OTP generation failure, session creation failure)

---

## Security Notes

1. **OTP in Response:** Currently, OTP is returned in the response for development/testing. **Remove this in production** and only show "OTP sent to email" message.

2. **JWT Token:** Store securely (localStorage or httpOnly cookie). Include in subsequent API requests:
   ```
   Authorization: Bearer <jwtToken>
   ```

3. **Session Expiry:** Sessions expire after 3 hours. Use the refresh endpoint (`POST /api/refresh`) to extend sessions.

4. **Password:** Frontend should hash password before sending (bcrypt hash starting with `$2`).

---

## Testing

For testing purposes, you can use:
- **Email:** Any valid admin email
- **Password:** Any password (will be validated)
- **OTP:** The OTP returned in Step 2 response (for now)

In production, OTP will be sent via email and won't be returned in the API response.







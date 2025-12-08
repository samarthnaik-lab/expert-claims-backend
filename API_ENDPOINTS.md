# Partner Dashboard API Endpoints

All APIs require authentication via `Authorization: Bearer {token}` header.

Base URL: `http://localhost:3000/api`

---

## 1. POST /api/login

**Description:** Partner login endpoint

**Headers:**
- `Content-Type: application/json`

**Request Body:**
```json
{
  "email": "string",
  "password": "string",
  "role": "partner"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "token": "eyJhbGci...",
  "jwtToken": "eyJhbGci...",
  "session_id": "uuid-here",
  "sessionId": "uuid-here",
  "userId": "3",
  "userRole": "partner",
  "expiry": "2025-12-07T18:34:48.040Z",
  "expiresAt": 1765132488040
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "samarth.naik@aiklisolve.com",
    "password": "your-password",
    "role": "partner"
  }'
```

---

## 2. GET /api/getpartnerdetails

**Description:** Get partner details by email

**Headers:**
- `Authorization: Bearer {token}`

**Query Parameters:**
- `email` (required): Partner email address

**Response (200 OK):**
```json
[
  {
    "partner_id": 3,
    "first_name": "Sam",
    "last_name": "Naik",
    "email": "samarth.naik@aiklisolve.com",
    "mobile_number": "...",
    "address": "...",
    ...
  }
]
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/getpartnerdetails?email=samarth.naik@aiklisolve.com" \
  -H "Authorization: Bearer {token}"
```

---

## 3. GET /api/568419fb-3d1d-4178-9d39-002d4100a3c0

**Description:** Get detailed partner information by partner_id

**Headers:**
- `Authorization: Bearer {token}`

**Query Parameters:**
- `partner_id` (required): Partner ID

**Response (200 OK):**
```json
[
  {
    "partner_id": 3,
    "first_name": "Sam",
    "last_name": "Naik",
    "email": "samarth.naik@aiklisolve.com",
    "mobile_number": "...",
    "address": "...",
    "partner_type": "...",
    "license_id": "...",
    ...
  }
]
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/568419fb-3d1d-4178-9d39-002d4100a3c0?partner_id=3" \
  -H "Authorization: Bearer {token}"
```

---

## 4. GET /api/MyReferral

**Description:** Get referral cases for a partner with optional pagination

**Headers:**
- `Authorization: Bearer {token}`

**Query Parameters:**
- `partner_id` (required): Partner ID
- `page` (optional): Page number (default: 1)
- `size` (optional): Page size (default: 10)
- If `page` and `size` NOT provided OR `size=10000`: Returns ALL referrals

**Response (200 OK):**
```json
[
  {
    "case_id": "ECSI-25-011",
    "case_summary": "...",
    "case_description": "...",
    "case_type_id": 1,
    "assigned_to": "...",
    "priority": "high",
    "ticket_stage": "in_progress",
    "due_date": "2025-12-15",
    "referring_partner_id": 3,
    "referral_date": "2025-12-01",
    "case_value": 10000,
    "value_currency": "INR",
    "bonus_eligible": true,
    "value_confirmed": true,
    ...
  }
]
```

**cURL Examples:**

Get paginated referrals:
```bash
curl -X GET "http://localhost:3000/api/MyReferral?partner_id=3&page=1&size=10" \
  -H "Authorization: Bearer {token}"
```

Get all referrals:
```bash
curl -X GET "http://localhost:3000/api/MyReferral?partner_id=3" \
  -H "Authorization: Bearer {token}"
```

Get all referrals (using size=10000):
```bash
curl -X GET "http://localhost:3000/api/MyReferral?partner_id=3&size=10000" \
  -H "Authorization: Bearer {token}"
```

---

## 5. POST /api/partner-status-check

**Description:** Get partner bonus status and calculations

**Headers:**
- `Authorization: Bearer {token}`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "partner_id": 3
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "partner_id": 3,
  "message": "Partner status retrieved successfully",
  "data": {
    "total_calculations": 1,
    "calculations": [
      {
        "calculation_id": 171,
        "case_id": "ECSI-25-011",
        "stage_bonus_amount": "1162.5",
        "case_value": 10000,
        "customer_first_name": "John",
        "customer_last_name": "Doe",
        "payment_date": "2025-12-05",
        "case_info": {
          "case_id": "ECSI-25-011",
          "case_summary": "...",
          "case_description": "...",
          "case_type_id": 1,
          "assigned_to": "...",
          "priority": "high",
          "ticket_stage": "completed",
          "due_date": "2025-12-15",
          "referral_date": "2025-12-01",
          "value_currency": "INR"
        }
      }
    ],
    "total_bonus_amount": 1162.5
  },
  "timestamp": "2025-12-07T18:34:48.040Z"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/partner-status-check \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "partner_id": 3
  }'
```

---

## 6. GET /api/referal_partner_id_data

**Description:** Get backlog/referral data for a partner

**Headers:**
- `Authorization: Bearer {token}`

**Query Parameters:**
- `backlog_referring_partner_id` (required): Partner ID

**Response (200 OK):**
```json
[
  {
    "backlog_id": 1,
    "referring_partner_id": 3,
    "case_id": "ECSI-25-011",
    "status": "pending",
    "referral_date": "2025-12-01",
    ...
  }
]
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/referal_partner_id_data?backlog_referring_partner_id=3" \
  -H "Authorization: Bearer {token}"
```

---

## Error Responses

All endpoints return errors in the following format:

**400 Bad Request:**
```json
{
  "status": "error",
  "message": "Missing required fields",
  "statusCode": 400
}
```

**401 Unauthorized:**
```json
{
  "status": "error",
  "message": "Invalid or expired token",
  "statusCode": 401
}
```

**404 Not Found:**
```json
{
  "status": "error",
  "message": "Partner not found",
  "statusCode": 404
}
```

**500 Internal Server Error:**
```json
{
  "status": "error",
  "message": "Internal server error",
  "statusCode": 500
}
```

---

## Authentication

All endpoints (except `/api/login`) require authentication:

1. Include the JWT token in the `Authorization` header:
   ```
   Authorization: Bearer {your-jwt-token}
   ```

2. The token is obtained from the `/api/login` endpoint response.

3. Token expires after 3 hours.

---

## Notes

- All timestamps are in ISO 8601 format
- All monetary values are in the specified currency
- Partner IDs and Case IDs are numeric or string identifiers
- Pagination uses 1-based page numbers


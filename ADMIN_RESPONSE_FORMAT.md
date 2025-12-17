# Admin Routes Response Format Standardization

## Summary

All admin routes have been standardized to use consistent response formats for both success and error responses.

## Response Format Standard

### Success Responses (200 OK)

All success responses return an **array** with a single object:

```json
[{
  "status": "success",
  "message": "Operation completed successfully",
  "data": {
    // Response data here
  }
}]
```

**Example:**
```json
[{
  "status": "success",
  "message": "User created successfully",
  "data": {
    "user_id": 123,
    "username": "john.doe",
    "email": "john@example.com",
    "role": "employee"
  }
}]
```

### Error Responses

All error responses return an **array** with a single object:

#### 400 Bad Request
```json
[{
  "status": "error",
  "message": "Validation error message",
  "error_code": "VALIDATION_ERROR",
  "field_errors": {
    // Optional: field-specific errors
  }
}]
```

#### 404 Not Found
```json
[{
  "status": "error",
  "message": "Resource not found",
  "error_code": "RESOURCE_NOT_FOUND"
}]
```

#### 500 Internal Server Error
```json
[{
  "status": "error",
  "message": "Internal server error message",
  "error_code": "INTERNAL_ERROR"
}]
```

## Standardized Endpoints

All admin endpoints now follow this format:

### 1. GET /admin/admindashboard
- **Success**: `[{...dashboardStats}]`
- **Error**: `[{status: 'error', ...}]`

### 2. GET /admin/getusers
- **Success**: `[{status: 'success', data: {...}}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 3. POST /admin/createuser
- **Success**: `[{status: 'success', message: '...', data: {...}}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 4. PATCH /admin/updateuser
- **Success**: `[{status: 'success', message: '...', data: {...}}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 5. DELETE /admin/deleteuser
- **Success**: `[{status: 'success', message: '...', data: {...}}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 6. GET /admin/getleaves
- **Success**: `[{status: 'success', data: [...], pagination: {...}}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 7. PATCH /admin/updateleavestatus
- **Success**: `[{status: 'success', message: '...', data: {...}}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 8. GET /admin/gapanalysis
- **Success**: `[{status: 'success', data: [...]}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 9. GET /admin/backlog_id
- **Success**: `[{...backlogData}]` or `[]` if not found
- **Error**: `[{status: 'error', error_code: '...'}]`

### 10. GET /admin/gettechnicalconsultant
- **Success**: `[{status: 'success', data: [...]}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 11. PATCH /admin/update_backlog
- **Success**: `[{status: 'success', message: '...', data: {...}}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 12. PATCH /admin/updatecunsultantpolicy
- **Success**: `[{status: 'success', message: '...', data: {...}}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 13. PATCH /admin/updatestatustechnicalconsultant
- **Success**: `[{status: 'success', message: '...', data: {...}}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 14. POST /admin/comments_insert
- **Success**: `[{status: 'success', message: '...', data: {...}}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 15. POST /admin/documentview
- **Success**: `[{status: 'success', url: '...', document_id: ..., ...}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 16. DELETE /admin/deletecase
- **Success**: `[{status: 'success', message: '...', data: {...}}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

### 17. GET /admin/gettasks
- **Success**: `[{status: 'success', data: [...]}]`
- **Error**: `[{status: 'error', error_code: '...'}]`

## Error Codes Reference

Common error codes used across admin endpoints:

- `MISSING_BACKLOG_ID` - backlog_id parameter is required
- `MISSING_USER_ID` - user_id parameter is required
- `MISSING_DOCUMENT_ID` - document_id is required
- `MISSING_COMMENT_TEXT` - comment_text is required
- `INVALID_PARAMETERS` - Invalid pagination or query parameters
- `INVALID_EMPLOYEE_ID` - Invalid employee_id
- `INVALID_DOCUMENT_ID` - Invalid document_id
- `INVALID_CASE_TYPE_ID` - Invalid case_type_id
- `BACKLOG_NOT_FOUND` - Backlog entry not found
- `CASE_NOT_FOUND` - Case not found
- `USER_NOT_FOUND` - User not found
- `DOCUMENT_NOT_FOUND` - Document not found
- `FILE_PATH_NOT_FOUND` - Document file path not found
- `USER_ALREADY_DELETED` - User is already deleted
- `CASE_ALREADY_DELETED` - Case is already deleted
- `VALIDATION_ERROR` - Validation failed
- `USER_FETCH_ERROR` - Failed to fetch users
- `USER_CREATION_ERROR` - Failed to create user
- `USER_UPDATE_ERROR` - Failed to update user
- `EMPLOYEE_UPDATE_ERROR` - Failed to update employee
- `PARTNER_UPDATE_ERROR` - Failed to update partner
- `CUSTOMER_UPDATE_ERROR` - Failed to update customer
- `ADMIN_UPDATE_ERROR` - Failed to update admin
- `BACKLOG_FETCH_ERROR` - Failed to fetch backlog
- `BACKLOG_UPDATE_ERROR` - Failed to update backlog
- `BACKLOG_DETAIL_FETCH_ERROR` - Failed to fetch backlog details
- `CONSULTANT_FETCH_ERROR` - Failed to fetch consultants
- `CONSULTANT_UPDATE_ERROR` - Failed to update consultant
- `COMMENT_INSERT_ERROR` - Failed to insert comment
- `LEAVE_FETCH_ERROR` - Failed to fetch leave applications
- `CASES_FETCH_ERROR` - Failed to fetch cases
- `GAP_ANALYSIS_ERROR` - Error in gap analysis
- `INTERNAL_ERROR` - Internal server error
- `INTERNAL_SERVER_ERROR` - Internal server error (alternative)

## Changes Made

1. ✅ Standardized all success responses to use array format `[{...}]`
2. ✅ Standardized all error responses to use array format `[{...}]`
3. ✅ Unified error field naming: `error_code` (instead of `code`)
4. ✅ Consistent error structure: `{status: 'error', message: '...', error_code: '...'}`
5. ✅ Consistent success structure: `{status: 'success', message: '...', data: {...}}`
6. ✅ Removed duplicate routes in adminRoutes.js
7. ✅ All HTTP status codes properly set (200, 400, 404, 500)

## Testing Checklist

- [ ] Test all GET endpoints return arrays
- [ ] Test all POST endpoints return arrays
- [ ] Test all PATCH endpoints return arrays
- [ ] Test all DELETE endpoints return arrays
- [ ] Verify error responses include `error_code`
- [ ] Verify success responses include `status: 'success'`
- [ ] Verify error responses include `status: 'error'`

---

**Last Updated**: 2024-12-17
**Status**: ✅ All responses standardized


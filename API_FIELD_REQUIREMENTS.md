# API Field Requirements - `/api/createTask`

## Overview
This document lists all mandatory and optional fields for the `/api/createTask` endpoint, organized by table.

---

## **MANDATORY FIELDS** (Required for API to work)

### **Top-Level Fields:**
1. ✅ **`case_Summary`** (string) - **REQUIRED** - Case summary/title
2. ✅ **`case_description`** (string) - **REQUIRED** - Detailed case description
3. ✅ **`referring_partner_id`** (string/number) - **REQUIRED** - Partner who is referring the case
   - OR `partner_id` (fallback)
   - OR user must be authenticated as a partner

### **Customer Object:**
- If `customer.customer_id` is provided → Customer will be updated
- If `customer.customer_id` is NOT provided → Customer will be created/checked by name
  - ✅ **`customer.firstName`** (string) - **REQUIRED** if creating new customer
  - ✅ **`customer.lastName`** (string) - **REQUIRED** if creating new customer

---

## **OPTIONAL FIELDS** (Can be omitted or null)

### **Case Fields:**
- `caseType` (string/number) - Case type ID (maps to `case_type_id`)
- `assignedTo` (string/number) - Employee ID to assign case to (maps to `assigned_to`)
- `priority` (string) - Priority level (e.g., "low", "medium", "high")
- `ticket_Stage` (string) - Current stage (defaults to "created" if not provided)
- `dueDate` (string) - Due date in format "YYYY-MM-DD"
- `case_value` (number) - Total case value
- `service_amount` (number/string) - Service amount
- `claims_amount` (number/string) - Claims amount
- `referral_date` (string) - Referral date (defaults to today if not provided)

### **Customer Object (All Optional):**
- `customer.customer_id` (number) - If provided, customer will be updated instead of created
- `customer.email` (string) - Email address
- `customer.mobileNumber` (string) - Mobile number
- `customer.emergencyContact` (string) - Emergency contact number
- `customer.gender` (string) - Gender
- `customer.age` (number) - Age
- `customer.address` (string) - Address
- `customer.customerType` (string) - Type of customer
- `customer.communicationPreference` (string) - Communication preference
- `customer.source` (string) - Source of customer
- `customer.languagePreference` (string) - Language preference
- `customer.notes` (string) - Notes
- `customer.gstin` (string) - GSTIN number
- `customer.pan` (string) - PAN number
- `customer.state` (string) - State
- `customer.pincode` (string/number) - Pincode
- `customer.claims_number` (string) - Claims number (not stored in database)

### **Stakeholders Array (Optional):**
- `stakeholders` (array) - Array of stakeholder objects
  - Each stakeholder object:
    - `name` or `stakeholder_name` (string) - Stakeholder name
    - `email` or `contactEmail` or `contact_email` (string) - Contact email
    - `phone` or `contact_phone` (string/number) - Contact phone
    - `role` (string) - Role of stakeholder
    - `notes` (string) - Notes about stakeholder

### **Comments (Optional):**
- `comments` (string) - Comment text to add to the case
- `internal` (string/boolean) - Whether comment is internal (defaults to false)

### **Payment Phases Array (Optional):**
- `payments` (array) - Array of payment phase objects
  - Each payment object:
    - `phase_name` or `name` (string) - Name of payment phase
    - `phase_amount` or `amount` (number) - Amount for this phase
    - `due_date` or `dueDate` (string) - Due date for payment
    - `status` (string) - Payment status (defaults to "pending")
    - `created_by` (number) - User who created this phase (optional)

---

## **Database Tables Populated:**

### 1. **`cases` Table** ✅
**Primary Key:** `case_id` (auto-generated: ECSI-YY-XXX format)

**Fields Inserted:**
- `case_id` - Auto-generated
- `case_summary` - From `case_Summary`
- `case_description` - From `case_description`
- `case_type_id` - From `caseType` (parsed to integer)
- `assigned_to` - From `assignedTo` (parsed to integer, nullable)
- `priority` - From `priority`
- `ticket_stage` - From `ticket_Stage` (defaults to "created")
- `due_date` - From `dueDate`
- `referring_partner_id` - From `referring_partner_id` or `partner_id`
- `referral_date` - From `referral_date` (defaults to today)
- `case_value` - From `case_value` (parsed to integer)
- `service_amount` - From `service_amount` (converted to string)
- `claim_amount` - From `claim_amount` (converted to string)
- `customer_id` - From customer creation/update
- `created_by` - From JWT token or request
- `created_time` - Current timestamp
- `deleted_flag` - Set to `false`

**Mandatory Database Fields:** Only `case_id` (auto-generated)

---

### 2. **`customers` Table** ✅
**Primary Key:** `customer_id` (auto-generated if creating new customer)

**Fields Inserted (when creating new customer):**
- `customer_id` - Auto-generated
- `first_name` - From `customer.firstName` ✅ **REQUIRED** if creating new
- `last_name` - From `customer.lastName` ✅ **REQUIRED** if creating new
- `email_address` - From `customer.email`
- `mobile_number` - From `customer.mobileNumber`
- `emergency_contact` - From `customer.emergencyContact`
- `gender` - From `customer.gender`
- `age` - From `customer.age` (converted to string)
- `address` - From `customer.address`
- `customer_type` - From `customer.customerType`
- `communication_preferences` - From `customer.communicationPreference`
- `source` - From `customer.source`
- `language_preference` - From `customer.languagePreference`
- `notes` - From `customer.notes`
- `gstin` - From `customer.gstin`
- `pan` - From `customer.pan`
- `state` - From `customer.state`
- `pincode` - From `customer.pincode`
- `partner_id` - From `referring_partner_id` or `partner_id`
- `created_by` - From JWT token
- `created_time` - Current timestamp
- `deleted_flag` - Set to `false`

**Mandatory Database Fields:** Only `customer_id` (auto-generated)

**Business Logic Requirements:** `firstName` and `lastName` required if `customer_id` not provided

---

### 3. **`case_stakeholders` Table** ✅
**Primary Key:** `stakeholder_id` (auto-generated)

**Fields Inserted (for each stakeholder):**
- `stakeholder_id` - Auto-generated (incremented for each stakeholder)
- `case_id` - From generated case ID
- `stakeholder_name` - From `stakeholder.name` or `stakeholder.stakeholder_name`
- `contact_email` - From `stakeholder.email` or `stakeholder.contactEmail` or `stakeholder.contact_email`
- `contact_phone` - From `stakeholder.phone` or `stakeholder.contact_phone` (parsed to integer)
- `role` - From `stakeholder.role`
- `notes` - From `stakeholder.notes`
- `created_by` - From JWT token
- `created_time` - Current timestamp

**Mandatory Database Fields:** Only `stakeholder_id` (auto-generated)

**Business Logic Requirements:** None (all fields optional, but at least `name` recommended)

---

### 4. **`case_payment_phases` Table** ✅
**Primary Key:** `case_phase_id` (auto-generated)

**Fields Inserted (for each payment phase):**
- `case_phase_id` - Auto-generated (incremented for each phase)
- `case_id` - From generated case ID
- `phase_name` - From `payment.phase_name` or `payment.name`
- `case_type_id` - From `caseType` (same as case)
- `phase_amount` - From `payment.phase_amount` or `payment.amount` (parsed to integer)
- `due_date` - From `payment.due_date` or `payment.dueDate`
- `status` - From `payment.status` (defaults to "pending")
- `created_by` - From JWT token
- `created_time` - Current timestamp

**Mandatory Database Fields:** Only `case_phase_id` (auto-generated)

**Business Logic Requirements:** None (all fields optional, but `phase_name` and `phase_amount` recommended)

---

### 5. **`case_comments` Table** ✅
**Primary Key:** `comment_id` (auto-generated)

**Fields Inserted:**
- `comment_id` - Auto-generated
- `case_id` - From generated case ID
- `user_id` - From JWT token (nullable if not available)
- `comment_text` - From `comments` (trimmed)
- `is_internal` - From `internal` (parsed: "true" string or boolean true)
- `created_time` - Current timestamp

**Mandatory Database Fields:** Only `comment_id` (auto-generated)

**Business Logic Requirements:** `comments` must be non-empty string if provided

---

### 6. **`case_stage_history` Table** ✅
**Primary Key:** `stage_history_id` (auto-generated)

**Fields Inserted (initial stage entry):**
- `stage_history_id` - Auto-generated
- `case_id` - From generated case ID
- `previous_stage` - Set to `null` (no previous stage for initial entry)
- `new_stage` - From `ticket_Stage`
- `changed_by` - From JWT token
- `changed_to` - From `assignedTo` (parsed to integer, nullable)
- `changed_reason` - Set to "Case created"
- `created_by` - From JWT token
- `created_time` - Current timestamp
- `deleted_flag` - Set to `false`

**Mandatory Database Fields:** Only `stage_history_id` (auto-generated)

**Business Logic Requirements:** Created automatically when case is created

---

### 7. **`case_documents` Table** ✅ (via `/api/upload` endpoint)
**Primary Key:** `document_id` (auto-generated)

**Fields Inserted (via upload API):**
- `document_id` - Auto-generated
- `case_id` - From request body `case_id`
- `category_id` - From request body `category_id` (parsed to integer)
- `original_filename` - From uploaded file
- `stored_filename` - Generated with version number
- `file_path` - S3 path
- `file_size` - From uploaded file
- `file_type` - Extracted from filename
- `mime_type` - From uploaded file
- `uploaded_by` - From JWT token (nullable)
- `upload_time` - Current timestamp
- `version_number` - Auto-incremented per case+category
- `is_customer_visible` - From request body `is_customer_visible`
- `is_active` - Set to `true`
- `deleted_flag` - Set to `false`

**Mandatory Database Fields:** Only `document_id` (auto-generated)

**Required for Upload API:**
- `case_id` (string) - **REQUIRED**
- `category_id` (string/number) - **REQUIRED**
- File upload (multipart/form-data) - **REQUIRED**
- `is_customer_visible` (string/boolean) - Optional (defaults to false)

---

## **Summary: Frontend Required Fields**

### **Absolutely Required (API will fail without these):**
1. ✅ `case_Summary` - Case summary
2. ✅ `case_description` - Case description
3. ✅ `referring_partner_id` OR `partner_id` - Partner ID

### **Conditionally Required:**
- If creating new customer (no `customer_id` provided):
  - ✅ `customer.firstName` - First name
  - ✅ `customer.lastName` - Last name

### **Recommended (for complete data):**
- `caseType` - Case type ID
- `assignedTo` - Employee ID to assign
- `priority` - Priority level
- `ticket_Stage` - Initial stage
- `dueDate` - Due date
- `case_value` - Case value
- `customer.email` - Customer email
- `customer.mobileNumber` - Customer mobile
- `stakeholders[]` - Array of stakeholders
- `comments` - Initial comment
- `payments[]` - Array of payment phases

---

## **Field Mapping Reference**

| Frontend Field | Database Field | Table | Notes |
|---------------|----------------|-------|-------|
| `case_Summary` | `case_summary` | `cases` | Required |
| `case_description` | `case_description` | `cases` | Required |
| `caseType` | `case_type_id` | `cases` | Parsed to integer |
| `assignedTo` | `assigned_to` | `cases` | Parsed to integer |
| `ticket_Stage` | `ticket_stage` | `cases` | Defaults to "created" |
| `referring_partner_id` | `referring_partner_id` | `cases` | Required |
| `customer.firstName` | `first_name` | `customers` | Required if new customer |
| `customer.lastName` | `last_name` | `customers` | Required if new customer |
| `customer.email` | `email_address` | `customers` | Optional |
| `customer.mobileNumber` | `mobile_number` | `customers` | Optional |
| `stakeholder.name` | `stakeholder_name` | `case_stakeholders` | Optional |
| `stakeholder.email` | `contact_email` | `case_stakeholders` | Optional |
| `comments` | `comment_text` | `case_comments` | Optional |
| `payment.phase_name` | `phase_name` | `case_payment_phases` | Optional |
| `payment.phase_amount` | `phase_amount` | `case_payment_phases` | Optional |

---

## **Error Handling**

The API will return errors in the following cases:

1. **400 Bad Request:**
   - Missing `case_Summary` or `case_description`
   - Missing `referring_partner_id` / `partner_id` and user is not authenticated as partner

2. **500 Internal Server Error:**
   - Foreign key constraint violations (invalid IDs)
   - Database insertion failures
   - ID generation failures

All errors are logged to `logs/api-log-YYYY-MM-DD.txt` with detailed context.

---

## **Notes:**

1. **ID Generation:** All primary keys (`case_id`, `customer_id`, `stakeholder_id`, `case_phase_id`, `comment_id`, `stage_history_id`, `document_id`) are auto-generated by the API.

2. **User ID:** Extracted from JWT token in `Authorization` header. If not available, falls back to `created_by` in request body.

3. **Customer Handling:** 
   - If `customer.customer_id` exists → Updates existing customer
   - If `customer.customer_id` doesn't exist → Creates new customer or finds existing by name+partner

4. **Comments:** Will be inserted even if `user_id` is null (allows anonymous comments).

5. **Stage History:** Automatically created when case is created, recording the initial stage.

6. **Documents:** Uploaded separately via `/api/upload` endpoint after case creation.


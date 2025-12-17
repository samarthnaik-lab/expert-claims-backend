# Expert Claims Database - Entity Relationship Diagrams (ERD)

This document contains Entity Relationship Diagrams (ERD) for the Expert Claims backend database schema.

## Table of Contents
1. [Core User Management](#core-user-management)
2. [Case Management](#case-management)
3. [Backlog Management](#backlog-management)
4. [Leave Management](#leave-management)
5. [Bonus & Payment Management](#bonus--payment-management)
6. [Document Management](#document-management)
7. [Complete Database ERD](#complete-database-erd)

---

## Core User Management

### Users and Role-Based Tables

```mermaid
erDiagram
    users ||--o{ admin : "has"
    users ||--o{ employees : "has"
    users ||--o{ partners : "has"
    users ||--o{ customers : "has"
    users ||--o{ user_session_details : "has"
    users ||--o{ user_otp : "has"
    users ||--o| users : "created_by"
    users ||--o| users : "updated_by"
    
    users {
        bigint user_id PK
        varchar username
        varchar email
        varchar mobile_number
        varchar password_hash
        enum role
        enum status
        boolean two_factor_enabled
        timestamp last_login
        integer failed_login_attempts
        timestamp account_locked_until
        bigint created_by FK
        bigint updated_by FK
        timestamp created_time
        timestamp updated_time
        boolean deleted_flag
    }
    
    admin {
        bigint admin_id PK
        bigint user_id FK
        varchar first_name
        varchar last_name
        text mobile_number
        text emergency_contact
        text gender
        bigint age
        text address
        timestamp created_at
        timestamp updated_at
    }
    
    employees {
        bigint employee_id PK
        bigint user_id FK
        text first_name
        text last_name
        text joining_date
        text employment_status
        text profile_picture_url
        text work_phone
        bigint work_extension
        text mobile_number
        text office_location
        text address
        text emergency_contact
        text bank_details
        text pan_number
        bigint aadhar_number
        text management_level
        bigint reports_to FK
        boolean can_approve_bonuses
        text max_bonus_approval_limit
        text team_name
        text department
        text designation
        text manager
        text gender
        timestamp created_time
        timestamp updated_time
        boolean deleted_flag
    }
    
    partners {
        bigint partner_id PK
        bigint user_id FK
        text first_name
        text last_name
        text mobile_number
        text emergency_contact
        text gender
        bigint age
        text address
        text partner_type
        text license_id
        text license_expire_date
        text name_of_entity
        text gstin
        text pan
        text state
        text pincode
        bigint created_by FK
        bigint updated_by FK
        timestamp created_at
        timestamp updated_at
        boolean deleted_flag
    }
    
    customers {
        bigint customer_id PK
        bigint user_id FK
        bigint partner_id FK
        text first_name
        text last_name
        text company_name
        text mobile_number
        text emergency_contact
        text email_address
        text address
        text customer_type
        text source
        text communication_preferences
        text language_preference
        text notes
        text gender
        text age
        text gstin
        text pan
        text state
        text pincode
        bigint created_by FK
        bigint updated_by FK
        timestamp created_time
        timestamp updated_time
        boolean deleted_flag
    }
    
    user_session_details {
        text session_id PK
        bigint user_id FK
        text jwt_token
        boolean remember_me_flag
        text ip_address
        text user_agent
        timestamp expires_at
        timestamp last_activity
        boolean is_active
        timestamp created_time
        timestamp updated_time
        boolean deleted_flag
    }
    
    user_otp {
        bigint otp_id PK
        bigint user_id FK
        text mobile_number
        bigint otp_code
        text purpose
        timestamp expires_at
        text used_at
        text attempts
        bigint max_attempts
        boolean is_used
        timestamp created_time
    }
    
    permissions {
        bigint permission_id PK
        text permission_name
        text permission_category
        text display_name
        text description
        boolean is_system_permission
        boolean is_active
    }
    
    role_permissions {
        bigint role_permission_id PK
        text role
        bigint permission_id FK
        boolean is_granted
        text conditions
        timestamp created_time
    }
```

---

## Case Management

### Cases and Related Entities

```mermaid
erDiagram
    users ||--o{ cases : "creates"
    users ||--o{ cases : "updates"
    users ||--o{ cases : "confirms_value"
    case_types ||--o{ cases : "categorizes"
    employees ||--o{ cases : "assigned_to"
    partners ||--o{ cases : "refers"
    customers ||--o{ cases : "belongs_to"
    cases ||--o{ case_comments : "has"
    cases ||--o{ case_documents : "has"
    cases ||--o{ case_stakeholders : "has"
    cases ||--o{ case_stage_history : "tracks"
    cases ||--o{ case_payment_phases : "has"
    case_comments ||--o| case_comments : "parent_comment"
    users ||--o{ case_comments : "creates"
    users ||--o{ case_documents : "uploads"
    users ||--o{ case_stakeholders : "creates"
    users ||--o{ case_stage_history : "tracks"
    employees ||--o{ case_stage_history : "changed_to"
    document_categories ||--o{ case_documents : "categorizes"
    case_types ||--o{ document_categories : "defines"
    
    cases {
        text case_id PK
        text case_summary
        text case_description
        bigint case_type_id FK
        bigint assigned_to FK
        text priority
        text ticket_stage
        text due_date
        text resolution_summary
        bigint customer_satisfaction_rating
        bigint referring_partner_id FK
        text referral_date
        bigint case_value
        text value_currency
        text referral_notes
        boolean bonus_eligible
        bigint value_confirmed
        bigint value_confirmed_by FK
        text value_confirmed_date
        bigint customer_id FK
        text task_type
        text service_amount
        text claim_amount
        bigint created_by FK
        bigint updated_by FK
        text created_time
        text updated_time
        boolean deleted_flag
    }
    
    case_types {
        bigint case_type_id PK
        text case_type_name
        text description
        boolean is_commercial
        boolean is_active
        bigint created_by FK
        bigint updated_by FK
        timestamp created_time
        timestamp updated_time
        boolean deleted_flag
    }
    
    case_comments {
        bigint comment_id PK
        text case_id FK
        bigint user_id FK
        text comment_text
        boolean is_internal
        bigint parent_comment_id FK
        timestamp created_time
        timestamp updated_time
    }
    
    case_documents {
        bigint document_id PK
        text case_id FK
        bigint category_id FK
        text original_filename
        text stored_filename
        text file_path
        bigint file_size
        text file_type
        text mime_type
        text checksum
        bigint version_number
        bigint uploaded_by FK
        timestamp upload_time
        timestamp last_accessed_time
        bigint access_count
        boolean is_customer_visible
        boolean is_active
        boolean deleted_flag
    }
    
    case_stakeholders {
        bigint stakeholder_id PK
        text case_id FK
        text stakeholder_name
        text contact_email
        bigint contact_phone
        text role
        text notes
        bigint created_by FK
        bigint updated_by FK
        timestamp created_time
        timestamp updated_time
    }
    
    case_stage_history {
        bigint stage_history_id PK
        text case_id FK
        text previous_stage
        text new_stage
        bigint changed_by FK
        bigint changed_to FK
        text changed_reason
        bigint created_by FK
        timestamp created_time
        boolean deleted_flag
    }
    
    case_payment_phases {
        bigint case_phase_id PK
        text case_id FK
        text phase_name
        bigint case_type_id FK
        bigint phase_amount
        text due_date
        text status
        bigint paid_amount
        text payment_date
        text payment_method
        text transaction_reference
        text invoice_number
        text notes
        bigint created_by FK
        bigint updated_by FK
        text created_time
        text updated_time
    }
    
    document_categories {
        bigint category_id PK
        bigint case_type_id FK
        text document_name
        boolean is_mandatory
        boolean is_active
        timestamp created_time
    }
```

---

## Backlog Management

### Backlog and Related Entities

```mermaid
erDiagram
    backlog ||--o{ backlog_comments : "has"
    backlog ||--o{ backlog_documents : "has"
    backlog }o--|| employees : "assigned_to"
    backlog }o--|| partners : "referred_by"
    backlog }o--|| case_typ : "case_type"
    users ||--o{ backlog_documents : "uploads"
    document_categories ||--o{ backlog_documents : "categorizes"
    
    backlog {
        text backlog_id PK
        bigint backlog_int_id
        varchar case_summary
        text case_description
        bigint case_type_id FK
        bigint backlog_referring_partner_id FK
        text backlog_referral_date
        timestamp created_time
        bigint created_by
        text updated_by
        timestamp updated_time
        boolean deleted_flag
        bigint assigned_to FK
        text status
        text assigned_consultant_name
        text expert_description
        text feedback
    }
    
    backlog_comments {
        bigint backlog_commentid PK
        text backlog_id FK
        text comment_text
        bigint created_by
        bigint updated_by
        timestamp created_time
        timestamp updated_time
        text createdby_name
        text updatedby_name
        text department
    }
    
    backlog_documents {
        bigint document_id PK
        bigint category_id FK
        text original_filename
        text stored_filename
        text file_path
        text file_size
        text file_type
        text mime_type
        text checksum
        bigint version_number
        bigint uploaded_by FK
        timestamp upload_time
        text last_accessed_time
        text access_count
        boolean is_customer_visible
        boolean is_active
        boolean deleted_flag
        text backlog_id FK
    }
    
    backlog_code_counters {
        bigint yy PK
        bigint last_num
    }
```

---

## Leave Management

### Leave Applications and Types

```mermaid
erDiagram
    employees ||--o{ leave_applications : "applies"
    leave_types ||--o{ leave_applications : "defines"
    users ||--o{ leave_applications : "approves"
    
    leave_applications {
        bigint application_id PK
        bigint employee_id FK
        bigint leave_type_id FK
        text start_date
        text end_date
        bigint total_days
        text reason
        jsonb emergency_contact
        text status
        text applied_date
        bigint approved_by FK
        text approved_date
        text rejection_reason
        text created_time
        text updated_time
    }
    
    leave_types {
        bigint leave_type_id PK
        text type_name
        text description
        bigint annual_entitlement
        boolean carry_forward_allowed
        bigint max_carry_forward
        boolean is_active
        timestamp created_time
    }
```

---

## Bonus & Payment Management

### Bonus Structures and Calculations

```mermaid
erDiagram
    case_typ ||--o{ case_type_bonus_structures : "has"
    case_typ ||--o{ case_type_payment_phase_templates : "has"
    users ||--o{ case_type_bonus_structures : "creates"
    users ||--o{ case_type_bonus_structures : "updates"
    users ||--o{ case_type_payment_phase_templates : "creates"
    users ||--o{ case_type_payment_phase_templates : "updates"
    partners ||--o{ partner_bonus_calculations : "receives"
    cases ||--o{ partner_bonus_calculations : "triggers"
    case_type_bonus_structures ||--o{ partner_bonus_calculations : "uses"
    users ||--o{ partner_bonus_calculations : "calculates"
    users ||--o{ partner_bonus_calculations : "approves"
    
    case_type_bonus_structures {
        bigint bonus_structure_id PK
        bigint case_type_id FK
        double precision base_percentage
        jsonb stage_bonus_rules
        jsonb performance_multipliers
        bigint minimum_case_value
        bigint maximum_bonus_cap
        text calculation_trigger_stage
        boolean requires_payment_confirmation
        text effective_date
        text expiry_date
        boolean is_active
        bigint created_by FK
        bigint updated_by FK
        text created_time
        text updated_time
    }
    
    case_type_payment_phase_templates {
        bigint template_id PK
        bigint case_type_id FK
        text phase_name
        bigint phase_sequence
        bigint percentage_of_total
        boolean is_mandatory
        text description
        boolean is_active
        bigint created_by FK
        bigint updated_by FK
        text created_time
        text updated_time
    }
    
    partner_bonus_calculations {
        bigint calculation_id PK
        bigint partner_id FK
        varchar case_id FK
        bigint case_type_bonus_structure_id FK
        bigint case_value
        double precision base_bonus_amount
        text stage_bonus_amount
        bigint performance_multiplier
        text performance_adjustment
        double precision total_bonus_amount
        text calculation_date
        text calculation_trigger
        jsonb calculation_details
        boolean is_approved
        bigint approved_by FK
        text approved_date
        text approval_notes
        bigint calculated_by FK
        text created_time
    }
```

---

## Document Management

### Document Categories and Files

```mermaid
erDiagram
    case_types ||--o{ document_categories : "defines"
    document_categories ||--o{ case_documents : "categorizes"
    document_categories ||--o{ backlog_documents : "categorizes"
    users ||--o{ case_documents : "uploads"
    users ||--o{ backlog_documents : "uploads"
    
    document_categories {
        bigint category_id PK
        bigint case_type_id FK
        text document_name
        boolean is_mandatory
        boolean is_active
        timestamp created_time
    }
    
    case_documents {
        bigint document_id PK
        text case_id FK
        bigint category_id FK
        text original_filename
        text stored_filename
        text file_path
        bigint file_size
        text file_type
        text mime_type
        text checksum
        bigint version_number
        bigint uploaded_by FK
        timestamp upload_time
        timestamp last_accessed_time
        bigint access_count
        boolean is_customer_visible
        boolean is_active
        boolean deleted_flag
    }
    
    backlog_documents {
        bigint document_id PK
        bigint category_id FK
        text original_filename
        text stored_filename
        text file_path
        text file_size
        text file_type
        text mime_type
        text checksum
        bigint version_number
        bigint uploaded_by FK
        timestamp upload_time
        text last_accessed_time
        text access_count
        boolean is_customer_visible
        boolean is_active
        boolean deleted_flag
        text backlog_id FK
    }
```

---

## Complete Database ERD

### Full Database Overview

```mermaid
erDiagram
    %% Core User Management
    users ||--o{ admin : "has"
    users ||--o{ employees : "has"
    users ||--o{ partners : "has"
    users ||--o{ customers : "has"
    users ||--o{ user_session_details : "has"
    users ||--o{ user_otp : "has"
    
    %% Case Management
    users ||--o{ cases : "creates"
    case_types ||--o{ cases : "categorizes"
    employees ||--o{ cases : "assigned_to"
    partners ||--o{ cases : "refers"
    customers ||--o{ cases : "belongs_to"
    cases ||--o{ case_comments : "has"
    cases ||--o{ case_documents : "has"
    cases ||--o{ case_stakeholders : "has"
    cases ||--o{ case_stage_history : "tracks"
    cases ||--o{ case_payment_phases : "has"
    
    %% Backlog Management
    backlog }o--|| employees : "assigned_to"
    backlog }o--|| partners : "referred_by"
    backlog }o--|| case_typ : "case_type"
    backlog ||--o{ backlog_comments : "has"
    backlog ||--o{ backlog_documents : "has"
    
    %% Leave Management
    employees ||--o{ leave_applications : "applies"
    leave_types ||--o{ leave_applications : "defines"
    users ||--o{ leave_applications : "approves"
    
    %% Bonus Management
    case_typ ||--o{ case_type_bonus_structures : "has"
    partners ||--o{ partner_bonus_calculations : "receives"
    cases ||--o{ partner_bonus_calculations : "triggers"
    
    %% Document Management
    case_types ||--o{ document_categories : "defines"
    document_categories ||--o{ case_documents : "categorizes"
    document_categories ||--o{ backlog_documents : "categorizes"
    
    users {
        bigint user_id PK
        varchar username
        varchar email
        varchar password_hash
        enum role
        enum status
    }
    
    admin {
        bigint admin_id PK
        bigint user_id FK
    }
    
    employees {
        bigint employee_id PK
        bigint user_id FK
        bigint reports_to FK
    }
    
    partners {
        bigint partner_id PK
        bigint user_id FK
    }
    
    customers {
        bigint customer_id PK
        bigint user_id FK
        bigint partner_id FK
    }
    
    cases {
        text case_id PK
        bigint case_type_id FK
        bigint assigned_to FK
        bigint referring_partner_id FK
        bigint customer_id FK
        bigint created_by FK
    }
    
    backlog {
        text backlog_id PK
        bigint case_type_id FK
        bigint backlog_referring_partner_id FK
        bigint assigned_to FK
    }
    
    leave_applications {
        bigint application_id PK
        bigint employee_id FK
        bigint leave_type_id FK
        bigint approved_by FK
    }
    
    case_type_bonus_structures {
        bigint bonus_structure_id PK
        bigint case_type_id FK
    }
    
    partner_bonus_calculations {
        bigint calculation_id PK
        bigint partner_id FK
        varchar case_id FK
        bigint case_type_bonus_structure_id FK
    }
```

---

## Key Relationships Summary

### Primary Relationships

1. **Users** → Central entity linking to:
   - Admin, Employees, Partners, Customers (role-based tables)
   - Sessions, OTP (authentication)
   - Cases, Comments, Documents (created/updated by)

2. **Cases** → Core business entity:
   - Linked to Case Types, Employees, Partners, Customers
   - Has Comments, Documents, Stakeholders, Payment Phases
   - Tracks Stage History

3. **Backlog** → Pre-case management:
   - Similar structure to Cases but for gap analysis
   - Has Comments and Documents
   - Linked to Partners and Employees

4. **Leave Management**:
   - Employees apply for leaves
   - Leave Types define leave categories
   - Users approve/reject applications

5. **Bonus System**:
   - Case Types have Bonus Structures
   - Partners receive bonuses based on Cases
   - Calculations tracked in Partner Bonus Calculations

6. **Document Management**:
   - Document Categories defined per Case Type
   - Documents attached to Cases and Backlogs
   - Users upload documents

---

## Notes

- **Soft Deletes**: Most tables use `deleted_flag` for soft deletion
- **Audit Fields**: Most tables have `created_by`, `updated_by`, `created_time`, `updated_time`
- **Self-Referencing**: 
  - `users` table references itself for `created_by` and `updated_by`
  - `employees` table references itself for `reports_to`
  - `case_comments` table references itself for `parent_comment_id`
- **Enum Types**: 
  - `users.role` uses `user_role_enum`
  - `users.status` uses `user_status_enum`

---

**Last Updated**: 2024-12-17
**Database**: PostgreSQL (Supabase)
**Schema**: public


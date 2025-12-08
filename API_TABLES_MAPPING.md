# API Tables Mapping

## POST /api/createTask

**Tables Used:**
1. **cases** - Main case/task record
   - Fields: case_id, case_summary, case_description, case_type_id, assigned_to, priority, ticket_stage, due_date, referring_partner_id, referral_date, customer_id, created_by, created_time, deleted_flag

2. **customers** - Customer information
   - Fields: customer_id, first_name, last_name, partner_id, created_by, created_time, deleted_flag
   - Action: Create new customer if not exists, or find existing by name

3. **case_stakeholders** - Stakeholders for the case
   - Fields: case_id, stakeholder_name, contact_email, contact_phone, role, notes, created_by, created_time
   - Action: Insert multiple stakeholders if provided

4. **case_comments** - Comments for the case
   - Fields: case_id, user_id, comment_text, is_internal, created_time
   - Action: Insert comment if provided

5. **case_payment_phases** - Payment phases for the case
   - Fields: case_id, phase_name, case_type_id, phase_amount, due_date, status, created_by, created_time
   - Action: Insert multiple payment phases if provided

6. **case_code_counters** - For generating case_id
   - Fields: yy (year), last_num
   - Action: Get/update counter to generate unique case_id (format: ECSI-YY-XXX)

---

## POST /api/partnerbacklogentry

**Tables Used:**
1. **backlog** - Main backlog entry
   - Fields: backlog_id, case_summary, case_description, case_type_id, backlog_referring_partner_id, backlog_referral_date, created_by, created_time, updated_by, updated_time, status, deleted_flag
   - Action: Insert new backlog entry

2. **customers** - Customer information
   - Fields: customer_id, first_name, last_name, partner_id, created_by, created_time, deleted_flag
   - Action: Create new customer if not exists, or find existing by name

3. **backlog_comments** - Comments for the backlog
   - Fields: backlog_id, comment_text, created_by, updated_by, created_time, updated_time, createdby_name, updatedby_name, department
   - Action: Insert comment if provided

4. **backlog_documents** - Documents/files for the backlog
   - Fields: backlog_id, original_filename, stored_filename, file_path, file_size, file_type, mime_type, uploaded_by, upload_time, is_active, deleted_flag
   - Action: Insert multiple documents if files are uploaded

5. **backlog_code_counters** - For generating backlog_id
   - Fields: yy (year), last_num
   - Action: Get/update counter to generate unique backlog_id (format: BLG-YY-XXX)

---

## Notes:

- **case_id** format: `ECSI-YY-XXX` (e.g., ECSI-25-001)
- **backlog_id** format: `BLG-YY-XXX` (e.g., BLG-25-001)
- Both IDs are auto-generated using code counters
- Customer records are created if they don't exist
- All timestamps are in ISO 8601 format
- File uploads for backlog documents need to be handled separately (multer middleware recommended)


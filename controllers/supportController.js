import BacklogModel from '../models/BacklogModel.js';
import BacklogCommentModel from '../models/BacklogCommentModel.js';
import supabase from '../config/database.js';
import path from 'path';

class SupportController {
  // GET /support/get_all_backlog_data?employee_id={employee_id}
  // Support Team endpoint: Get all backlog entries assigned to a specific employee with full relationships
  static async getAllBacklogData(req, res) {
    try {
      const { employee_id } = req.query;

      // Validate employee_id parameter
      if (!employee_id) {
        return res.status(400).json({
          status: 'error',
          message: 'employee_id query parameter is required',
          statusCode: 400
        });
      }

      // Validate employee_id is a valid number
      const employeeIdNum = parseInt(employee_id);
      if (isNaN(employeeIdNum) || employeeIdNum <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'employee_id must be a valid positive number',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Fetching all backlog data for employee_id: ${employeeIdNum}`);

      // Fetch all backlog entries assigned to this employee with relationships
      const { data: backlogList, error } = await BacklogModel.findByEmployeeId(employeeIdNum);

      if (error) {
        console.error('[Support Team] Error fetching backlog by employee_id:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch backlog data',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Return data as array (empty array if no backlog found)
      return res.status(200).json(backlogList || []);

    } catch (error) {
      console.error('[Support Team] Get all backlog data error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /support/backlog_id?backlog_id={backlog_id}
  // Support Team endpoint: Get backlog details by backlog_id with full relationships
  static async getBacklogById(req, res) {
    try {
      const { backlog_id } = req.query;

      // Validate backlog_id parameter
      if (!backlog_id || backlog_id === 'undefined') {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id query parameter is required',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Fetching backlog data for backlog_id: ${backlog_id}`);

      // Fetch backlog with all nested relationships
      const { data: backlogData, error } = await BacklogModel.findByBacklogId(backlog_id);

      if (error) {
        console.error('[Support Team] Error fetching backlog:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch backlog data',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      if (!backlogData) {
        return res.status(404).json({
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          statusCode: 404
        });
      }

      // Add partner_name from partners if exists
      if (backlogData.partners) {
        const firstName = backlogData.partners.first_name || '';
        const lastName = backlogData.partners.last_name || '';
        backlogData.partner_name = `${firstName}${lastName}`.trim() || null;
      } else {
        backlogData.partner_name = null;
      }

      // Return data as array (matching n8n format)
      return res.status(200).json([backlogData]);

    } catch (error) {
      console.error('[Support Team] Get backlog by ID error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /support/gettechnicalconsultant
  // Support Team endpoint: Get all technical consultants (employees)
  static async getTechnicalConsultants(req, res) {
    try {
      console.log('[Support Team] Fetching technical consultants');

      // Fetch all employees who are technical consultants
      // Filter by designation containing "consultant" or "technical" (case-insensitive)
      // Also filter out deleted employees
      const { data: employees, error } = await supabase
        .from('employees')
        .select('*')
        .or('designation.ilike.%consultant%,designation.ilike.%technical%')
        .eq('deleted_flag', false)
        .order('first_name', { ascending: true });

      if (error) {
        console.error('[Support Team] Error fetching technical consultants:', error);
        
        // If the filter fails, try fetching all active employees
        const { data: allEmployees, error: allError } = await supabase
          .from('employees')
          .select('*')
          .eq('deleted_flag', false)
          .order('first_name', { ascending: true });

        if (allError) {
          return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch technical consultants',
            error: allError.message || 'Unknown error',
            statusCode: 500
          });
        }

        // Return all active employees if specific filter doesn't work
        return res.status(200).json(allEmployees || []);
      }

      // If no employees found with consultant designation, fetch all active employees
      if (!employees || employees.length === 0) {
        console.log('[Support Team] No consultants found with designation filter, fetching all active employees');
        const { data: allEmployees, error: allError } = await supabase
          .from('employees')
          .select('*')
          .eq('deleted_flag', false)
          .order('first_name', { ascending: true });

        if (allError) {
          return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch employees',
            error: allError.message || 'Unknown error',
            statusCode: 500
          });
        }

        return res.status(200).json(allEmployees || []);
      }

      // Return technical consultants
      return res.status(200).json(employees || []);

    } catch (error) {
      console.error('[Support Team] Get technical consultants error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // PATCH /support/updatestatustechnicalconsultant
  // Support Team endpoint: Update backlog status and assign technical consultant
  static async updateStatusTechnicalConsultant(req, res) {
    try {
      const { backlog_id, status, expert_description, updated_by, user_id } = req.body;

      // Validate required fields
      if (!backlog_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id is required',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Updating backlog status and consultant for backlog_id: ${backlog_id}`);

      // Prepare update data
      const updateData = {
        updated_time: new Date().toISOString()
      };

      // Add status if provided
      if (status !== undefined && status !== null) {
        updateData.status = status;
      }

      // Add expert_description if provided
      if (expert_description !== undefined && expert_description !== null) {
        updateData.expert_description = expert_description;
      }

      // Add updated_by if provided
      if (updated_by !== undefined && updated_by !== null) {
        updateData.updated_by = updated_by;
        // Also update assigned_consultant_name with the same value
        updateData.assigned_consultant_name = updated_by;
      }

      // Add assigned_to (from user_id) if provided
      if (user_id !== undefined && user_id !== null) {
        const userIdNum = parseInt(user_id);
        if (!isNaN(userIdNum) && userIdNum > 0) {
          updateData.assigned_to = userIdNum;
        }
      }

      // Update backlog entry
      const { data: updatedBacklog, error } = await BacklogModel.update(backlog_id, updateData);

      if (error) {
        console.error('[Support Team] Error updating backlog:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to update backlog',
          error: error.message || 'Unknown error',
          statusCode: 500
        });
      }

      if (!updatedBacklog) {
        return res.status(404).json({
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          statusCode: 404
        });
      }

      // Return updated backlog data
      return res.status(200).json({
        status: 'success',
        message: 'Backlog updated successfully',
        data: updatedBacklog,
        statusCode: 200
      });

    } catch (error) {
      console.error('[Support Team] Update status technical consultant error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // POST /support/comments_insert
  // Support Team endpoint: Insert backlog comment
  static async insertComment(req, res) {
    try {
      const {
        backlog_id,
        comment_text,
        created_by,
        createdby_name,
        updated_by,
        updatedby_name,
        department,
        email, // Not stored in table, just for logging
        role // Not stored in table, just for logging
      } = req.body;

      // Validate required fields
      if (!backlog_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id is required in request body',
          statusCode: 400
        });
      }

      if (!comment_text || comment_text.trim() === '') {
        return res.status(400).json({
          status: 'error',
          message: 'comment_text is required and cannot be empty',
          statusCode: 400
        });
      }

      console.log(`[Support Team] Inserting comment for backlog_id: ${backlog_id}`);

      // Validate backlog exists
      const { data: existingBacklog, error: fetchError } = await supabase
        .from('backlog')
        .select('backlog_id')
        .eq('backlog_id', backlog_id)
        .single();

      if (fetchError || !existingBacklog) {
        return res.status(404).json({
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          statusCode: 404
        });
      }

      // Validate created_by and updated_by if provided
      if (created_by) {
        const { data: userCheck } = await supabase
          .from('users')
          .select('user_id')
          .eq('user_id', parseInt(created_by))
          .single();

        if (!userCheck) {
          console.warn(`[Support Team] Warning: created_by ${created_by} does not exist in users table`);
        }
      }

      if (updated_by) {
        const { data: userCheck } = await supabase
          .from('users')
          .select('user_id')
          .eq('user_id', parseInt(updated_by))
          .single();

        if (!userCheck) {
          console.warn(`[Support Team] Warning: updated_by ${updated_by} does not exist in users table`);
        }
      }

      // Prepare comment data
      const commentData = {
        backlog_id: backlog_id,
        comment_text: comment_text.trim(),
        created_by: created_by ? parseInt(created_by) : null,
        updated_by: updated_by ? parseInt(updated_by) : null,
        createdby_name: createdby_name || null,
        updatedby_name: updatedby_name || null,
        department: department || null,
        created_time: new Date().toISOString(),
        updated_time: new Date().toISOString()
      };

      console.log(`[Support Team] Comment data:`, {
        backlog_id: commentData.backlog_id,
        created_by: commentData.created_by,
        department: commentData.department,
        comment_length: commentData.comment_text.length,
        email: email,
        role: role
      });

      // Insert comment into database
      const { data: insertedComment, error: insertError } = await BacklogCommentModel.create(commentData);

      if (insertError) {
        console.error('[Support Team] Error inserting comment:', insertError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to insert comment',
          error: insertError.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Return success response
      return res.status(200).json({
        status: 'success',
        message: 'Comment inserted successfully',
        data: insertedComment
      });

    } catch (error) {
      console.error('[Support Team] Insert comment error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // POST /support/partnerdocumentview
  // View partner document - simple version
  static async partnerDocumentView(req, res) {
    try {
      const { document_id } = req.body;

      if (!document_id) {
        return res.status(400).json({
          success: false,
          error: 'document_id is required'
        });
      }

      console.log(`[View Document] Fetching document_id: ${document_id}`);

      // Step 1: Get document from database
      const { data: document, error: docError } = await supabase
        .from('backlog_documents')
        .select('document_id, backlog_id, file_path')
        .eq('document_id', document_id)
        .maybeSingle();

      if (docError || !document) {
        console.error('[View Document] Document not found:', docError);
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      console.log(`[View Document] Found document: file_path=${document.file_path}`);

      // Step 2: Get backlog to find case_type_name
      const { data: backlog, error: backlogError } = await supabase
        .from('backlog')
        .select('case_type_id')
        .eq('backlog_id', document.backlog_id)
        .maybeSingle();

      if (backlogError || !backlog) {
        return res.status(404).json({
          success: false,
          error: 'Backlog not found'
        });
      }

      // Step 3: Get case_type_name
      const { data: caseType, error: caseError } = await supabase
        .from('case_types')
        .select('case_type_name')
        .eq('case_type_id', backlog.case_type_id)
        .maybeSingle();

      if (caseError || !caseType) {
        return res.status(404).json({
          success: false,
          error: 'Case type not found'
        });
      }

      // Step 4: Construct bucket name
      const bucketName = `expc-${caseType.case_type_name.trim().toLowerCase().replace(/\s+/g, '-')}`;
      console.log(`[View Document] Using bucket: ${bucketName}`);

      // Step 5: Extract file path
      let storagePath = document.file_path;
      
      console.log(`[View Document] Original file_path: ${storagePath}`);
      
      // If it's a full URL, extract just the path
      if (storagePath && storagePath.includes('/storage/v1/object/public/')) {
        const parts = storagePath.split('/storage/v1/object/public/');
        if (parts.length > 1) {
          const pathParts = parts[1].split('/');
          // Remove bucket name (first part) and keep the rest
          if (pathParts.length > 1) {
            storagePath = pathParts.slice(1).join('/');
          } else {
            storagePath = parts[1];
          }
        }
      } else if (storagePath && storagePath.startsWith('bk-')) {
        // Already in correct format: bk-ECSI-GA-25-086/filename.pdf
        storagePath = storagePath;
      } else if (storagePath && storagePath.includes(bucketName + '/')) {
        // If path contains bucket name, remove it
        storagePath = storagePath.split(bucketName + '/')[1] || storagePath;
      }

      console.log(`[View Document] Extracted storage path: ${storagePath}`);

      // Step 6: Download file from storage - try multiple buckets
      const bucketVariations = [
        bucketName, // expc-{case_type_name}
        `public-${caseType.case_type_name.trim().toLowerCase().replace(/\s+/g, '-')}`, // public-{case_type_name}
        'backlog-documents', // Fallback bucket
        'public-fire' // Common bucket
      ];

      let fileData = null;
      let downloadError = null;
      let usedBucket = null;

      for (const bucket of bucketVariations) {
        console.log(`[View Document] Trying bucket: ${bucket}`);
        const { data, error } = await supabase.storage
          .from(bucket)
          .download(storagePath);

        if (!error && data) {
          fileData = data;
          usedBucket = bucket;
          console.log(`[View Document] ✓ File found in bucket: ${bucket}`);
          break;
        } else {
          console.log(`[View Document] ✗ Not found in bucket: ${bucket}, error: ${error?.message}`);
          downloadError = error;
        }
      }

      if (!fileData) {
        console.error('[View Document] File not found in any bucket');
        console.error('[View Document] Tried buckets:', bucketVariations);
        console.error('[View Document] Storage path:', storagePath);
        return res.status(500).json({
          success: false,
          error: 'File not found in storage',
          details: {
            tried_buckets: bucketVariations,
            storage_path: storagePath,
            case_type_name: caseType.case_type_name
          }
        });
      }

      // Step 7: Return file
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const ext = path.extname(storagePath).toLowerCase();
      
      // Determine Content-Type based on file extension
      // Supported: PDF, DOC, DOCX, JPG, PNG, TXT
      const contentTypeMap = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      console.log(`[View Document] Returning file: ${buffer.length} bytes, type: ${contentType}, extension: ${ext}`);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(storagePath)}"`);
      return res.send(buffer);

    } catch (error) {
      console.error('[View Document] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error: ' + error.message
      });
    }
  }
}

export default SupportController;


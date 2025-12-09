import PartnerModel from '../models/PartnerModel.js';
import ReferralModel from '../models/ReferralModel.js';
import BonusModel from '../models/BonusModel.js';
import CaseModel from '../models/CaseModel.js';
import CustomerModel from '../models/CustomerModel.js';
import StakeholderModel from '../models/StakeholderModel.js';
import CommentModel from '../models/CommentModel.js';
import PaymentModel from '../models/PaymentModel.js';
import BacklogModel from '../models/BacklogModel.js';
import BacklogCommentModel from '../models/BacklogCommentModel.js';
import BacklogDocumentModel from '../models/BacklogDocumentModel.js';
import IdGenerator from '../utils/idGenerator.js';
import Validators from '../utils/validators.js';


import supabase from '../config/database.js';
import path from 'path';

class PartnerController {
  // GET /api/getpartnerdetails?email={email}
  static async getPartnerDetailsByEmail(req, res) {
    try {
      const { email } = req.query;

      if (!email) {
        return res.status(400).json({
          status: 'error',
          message: 'Email parameter is required',
          statusCode: 400
        });
      }

      if (!Validators.isValidEmail(email)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid email format',
          statusCode: 400
        });
      }

      console.log(`Fetching partner details for email: ${email}`);

      const { data: partner, error } = await PartnerModel.findByEmail(email);

      if (error) {
        console.error('Database error:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Database error',
          statusCode: 500
        });
      }

      if (!partner) {
        return res.status(404).json({
          status: 'error',
          message: 'Partner not found',
          statusCode: 404
        });
      }

      // Return as array of partner objects
      return res.status(200).json([partner]);
    } catch (error) {
      console.error('Get partner details error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        statusCode: 500
      });
    }
  }

  // GET /api/568419fb-3d1d-4178-9d39-002d4100a3c0?partner_id={partner_id}
  static async getPartnerDetailsById(req, res) {
    try {
      const { partner_id } = req.query;

      if (!partner_id) {
        return res.status(400).json({
          status: 'error',
          message: 'partner_id parameter is required',
          statusCode: 400
        });
      }

      if (!Validators.isValidPartnerId(partner_id)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid partner_id',
          statusCode: 400
        });
      }

      console.log(`Fetching partner details for partner_id: ${partner_id}`);

      const { data: partner, error } = await PartnerModel.findByPartnerId(partner_id);

      if (error) {
        console.error('Database error:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Database error',
          statusCode: 500
        });
      }

      if (!partner) {
        return res.status(404).json({
          status: 'error',
          message: 'Partner not found',
          statusCode: 404
        });
      }

      // Return as array of partner detail objects
      return res.status(200).json([partner]);
    } catch (error) {
      console.error('Get partner details by ID error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        statusCode: 500
      });
    }
  }

  // GET /api/MyReferral?partner_id={partner_id}&page={page}&size={size}
  static async getReferrals(req, res) {
    try {
      const { partner_id, page, size } = req.query;

      if (!partner_id) {
        return res.status(400).json({
          status: 'error',
          message: 'partner_id parameter is required',
          statusCode: 400
        });
      }

      if (!Validators.isValidPartnerId(partner_id)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid partner_id',
          statusCode: 400
        });
      }

      console.log(`Fetching referrals for partner_id: ${partner_id}, page: ${page}, size: ${size}`);

      // If size=10000 or page/size not provided, return all referrals
      const sizeNum = size ? parseInt(size) : null;
      if (!page && !size || sizeNum === 10000) {
        // Return all referrals
        const { data: referrals, error } = await ReferralModel.findAllByPartnerId(partner_id);

        if (error) {
          console.error('Database error:', error);
          return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch referrals',
            statusCode: 500
          });
        }

        return res.status(200).json(referrals || []);
      } else {
        // Use pagination
        const pagination = Validators.validatePagination(page, size);
        const { data: referrals, error, count } = await ReferralModel.findByPartnerId(
          partner_id,
          pagination.page,
          pagination.size
        );

        if (error) {
          console.error('Database error:', error);
          return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch referrals',
            statusCode: 500
          });
        }

        return res.status(200).json(referrals || []);
      }
    } catch (error) {
      console.error('Get referrals error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        statusCode: 500
      });
    }
  }

  // POST /api/partner-status-check
  static async getPartnerStatusCheck(req, res) {
    try {


      const { partner_id, page, size } = req.body;

      if (!partner_id) {
        return res.status(400).json({
          status: 'error',
          message: 'partner_id is required in request body',
          statusCode: 400
        });
      }

      if (!Validators.isValidPartnerId(partner_id)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid partner_id',
          statusCode: 400
        });
      }



      console.log(`Checking partner status for partner_id: ${partner_id}, page: ${page}, size: ${size}`);

      // Get bonus calculations with pagination support
      // If size=10000 or page/size not provided, return all calculations
      const sizeNum = size ? parseInt(size) : null;
      const pageNum = page ? parseInt(page) : null;
      
      let calculations, calcError, totalCount;
      if (!pageNum && !sizeNum || sizeNum === 10000) {
        // Return all calculations (no pagination)
        const result = await BonusModel.getBonusCalculations(partner_id);
        calculations = result.data;
        calcError = result.error;
      } else {
        // Use pagination
        const pagination = Validators.validatePagination(pageNum, sizeNum);
        const result = await BonusModel.getBonusCalculations(
          partner_id,
          pagination.page,
          pagination.size
        );
        calculations = result.data;
        calcError = result.error;
        totalCount = result.count;
      }

      if (calcError) {
        console.error('Error fetching bonus calculations:', calcError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch bonus calculations',
          statusCode: 500
        });
      }



      // Calculate total bonus - always get total from ALL records, not just paginated ones
      // This ensures total_bonus_amount reflects all partner's bonuses
      let totalBonus = 0;
      if (pageNum && sizeNum && sizeNum !== 10000) {
        // If paginated, get total from all records
        const { data: allCalculations } = await BonusModel.getBonusCalculations(partner_id);
        if (allCalculations && allCalculations.length > 0) {
          totalBonus = allCalculations.reduce((sum, calc) => {
            return sum + (parseFloat(calc.total_bonus_amount) || 0);
          }, 0);
        }
      } else {
        // If not paginated, use current calculations
        if (calculations && calculations.length > 0) {
          totalBonus = calculations.reduce((sum, calc) => {
            return sum + (parseFloat(calc.total_bonus_amount) || 0);
          }, 0);
        }
      }

      // Format calculations with required fields matching n8n response
      const formattedCalculations = (calculations || []).map(calc => {
        const caseInfo = calc.cases || {};
        const customerInfo = caseInfo.customers || {};


        
        // Extract calculation_details JSONB fields
        const calcDetails = calc.calculation_details || {};
        const period = calcDetails.period || null;
        const appliedRate = calcDetails.applied_rate || null;
        const halfyearTotal = calcDetails.halfyear_total || null;

        return {
          calculation_id: calc.calculation_id,
          case_id: calc.case_id,


          stage_bonus_amount: calc.stage_bonus_amount || 0,
          case_value: calc.case_value || caseInfo.case_value || 0,
          base_bonus: calc.base_bonus_amount || 0,
          total_bonus_amount: calc.total_bonus_amount || 0,
          customer_first_name: customerInfo.first_name || null,
          customer_last_name: customerInfo.last_name || null,


          payment_date: calc.payment_date || calc.calculation_date || null,
          period: period,
          applied_rate: appliedRate,
          halfyear_total: halfyearTotal,
          case_info: caseInfo.case_id ? {
            case_id: caseInfo.case_id,
            case_summary: caseInfo.case_summary,
            case_description: caseInfo.case_description,
            case_type_id: caseInfo.case_type_id,
            assigned_to: caseInfo.assigned_to,
            priority: caseInfo.priority,
            ticket_stage: caseInfo.ticket_stage,
            due_date: caseInfo.due_date,
            referral_date: caseInfo.referral_date,
            value_currency: caseInfo.value_currency
          } : null
        };
      });



      // Return as array to match n8n response structure
      return res.status(200).json([{
        status: 'completed',
        partner_id: String(partner_id),
        message: formattedCalculations.length > 0 ? 'Partner has bonus calculations' : 'Partner has no bonus calculations',
        data: {


          total_calculations: totalCount !== undefined ? totalCount : formattedCalculations.length,
          total_bonus_amount: totalBonus,
          calculations: formattedCalculations
        },
        timestamp: new Date().toISOString()


      }]);
    } catch (error) {
      console.error('Partner status check error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        statusCode: 500
      });
    }
  }

  // GET /api/referal_partner_id_data?backlog_referring_partner_id={partner_id}
  static async getBacklogData(req, res) {
    try {
      const { backlog_referring_partner_id } = req.query;

      if (!backlog_referring_partner_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_referring_partner_id parameter is required',
          statusCode: 400
        });
      }

      if (!Validators.isValidPartnerId(backlog_referring_partner_id)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid backlog_referring_partner_id',
          statusCode: 400
        });
      }

      console.log(`Fetching backlog data for partner_id: ${backlog_referring_partner_id}`);

      const { data: backlogData, error } = await ReferralModel.findBacklogByPartnerId(
        backlog_referring_partner_id
      );

      if (error) {
        console.error('Database error:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch backlog data',
          statusCode: 500
        });
      }

      return res.status(200).json(backlogData || []);
    } catch (error) {
      console.error('Get backlog data error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        statusCode: 500
      });
    }
  }

  // POST /api/createTask
  static async createTask(req, res) {
    try {
      const {
        case_Summary,
        case_description,
        caseType,
        assignedTo,
        priority,
        ticket_Stage,
        dueDate,
        stakeholders,
        customer,
        comments,
        internal,
        payments,
        updatedby_name,
        createdby_name
      } = req.body;

      const userId = req.user?.user_id;
      // Get partner_id from partners table by user_id
      let partnerId = null;
      if (userId) {
        const { data: partner } = await PartnerModel.findByUserId(userId);
        partnerId = partner?.partner_id || null;
      }
      
      if (!partnerId) {
        return res.status(400).json({
          success: false,
          message: 'Partner not found for this user',
          statusCode: 400
        });
      }

      if (!case_Summary || !case_description) {
        return res.status(400).json({
          success: false,
          message: 'case_Summary and case_description are required',
          statusCode: 400
        });
      }

      // Generate case_id
      const caseId = await IdGenerator.generateCaseId();

      // Create or find customer
      let customerId = null;
      if (customer && customer.firstName && customer.lastName) {
        const { data: existingCustomer } = await CustomerModel.findByName(
          customer.firstName,
          customer.lastName,
          partnerId
        );

        if (existingCustomer) {
          customerId = existingCustomer.customer_id;
        } else {
          // Create new customer
          const { data: newCustomer, error: customerError } = await CustomerModel.create({
            first_name: customer.firstName,
            last_name: customer.lastName,
            partner_id: partnerId,
            created_by: userId,
            created_time: new Date().toISOString(),
            deleted_flag: false
          });

          if (!customerError && newCustomer) {
            customerId = newCustomer.customer_id;
          }
        }
      }

      // Get case_type_id from caseType (assuming caseType is name, need to query case_types table)
      // For now, assuming caseType is already the ID
      const caseTypeId = caseType ? parseInt(caseType) : null;

      // Create case
      const caseData = {
        case_id: caseId,
        case_summary: case_Summary,
        case_description: case_description,
        case_type_id: caseTypeId,
        assigned_to: assignedTo ? parseInt(assignedTo) : null,
        priority: priority || null,
        ticket_stage: ticket_Stage || 'created',
        due_date: dueDate || null,
        referring_partner_id: partnerId,
        referral_date: new Date().toISOString().split('T')[0],
        customer_id: customerId,
        created_by: userId,
        created_time: new Date().toISOString(),
        deleted_flag: false
      };

      const { data: createdCase, error: caseError } = await CaseModel.create(caseData);

      if (caseError || !createdCase) {
        console.error('Error creating case:', caseError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create case',
          statusCode: 500
        });
      }

      // Create stakeholders
      if (stakeholders && Array.isArray(stakeholders) && stakeholders.length > 0) {
        const stakeholdersData = stakeholders.map(stakeholder => ({
          case_id: caseId,
          stakeholder_name: stakeholder.name || stakeholder.stakeholder_name,
          contact_email: stakeholder.email || stakeholder.contact_email,
          contact_phone: stakeholder.phone || stakeholder.contact_phone,
          role: stakeholder.role || null,
          notes: stakeholder.notes || null,
          created_by: userId,
          created_time: new Date().toISOString()
        }));

        await StakeholderModel.createMultiple(stakeholdersData);
      }

      // Create comment
      if (comments) {
        await CommentModel.create({
          case_id: caseId,
          user_id: userId,
          comment_text: comments,
          is_internal: internal === 'true' || internal === true,
          created_time: new Date().toISOString()
        });
      }

      // Create payment phases
      if (payments && Array.isArray(payments) && payments.length > 0) {
        const paymentsData = payments.map(payment => ({
          case_id: caseId,
          phase_name: payment.phase_name || payment.name,
          case_type_id: caseTypeId,
          phase_amount: payment.amount ? parseInt(payment.amount) : null,
          due_date: payment.due_date || payment.dueDate,
          status: payment.status || 'pending',
          created_by: userId,
          created_time: new Date().toISOString()
        }));

        await PaymentModel.createMultiple(paymentsData);
      }

      return res.status(200).json({
        success: true,
        message: 'Task created successfully',
        case_id: caseId
      });
    } catch (error) {
      console.error('Create task error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // POST /api/partnerbacklogentry
  static async createPartnerBacklogEntry(req, res) {
    try {
      const userId = req.user?.user_id;
      // Get partner_id from partners table by user_id
      let partnerId = null;
      if (userId) {
        const { data: partner } = await PartnerModel.findByUserId(userId);
        partnerId = partner?.partner_id || null;
      }
      
      if (!partnerId) {
        return res.status(400).json({
          success: false,
          message: 'Partner not found for this user',
          statusCode: 400
        });
      }

      // Get form data - handle both JSON and form-data
      // Log for debugging
      console.log('Request body:', req.body);
      console.log('Request files:', req.files);
      
      const body = req.body || {};
      const {
        case_type_id,
        backlog_referring_partner_id,
        backlog_referral_date,
        created_by,
        department = 'partner',
        updated_by,
        comment_text,
        task_summary,
        case_description,
        case_type,
        created_date,
        status = 'created',
        customer_username,
        customer_first_name,
        customer_last_name,
        document_count,
        selected_document_type,
        selected_document_type_name,
        updatedby_name,
        createdby_name,
        partner_name
      } = body;

      if (!task_summary || !case_description) {
        return res.status(400).json({
          success: false,
          message: 'task_summary and case_description are required',
          statusCode: 400
        });
      }

      // Generate backlog_id
      const backlogId = await IdGenerator.generateBacklogId();

      // Create or find customer
      let customerId = null;
      if (customer_first_name && customer_last_name) {
        const { data: existingCustomer } = await CustomerModel.findByName(
          customer_first_name,
          customer_last_name,
          backlog_referring_partner_id || partnerId
        );

        if (existingCustomer) {
          customerId = existingCustomer.customer_id;
        } else {
          const { data: newCustomer, error: customerError } = await CustomerModel.create({
            first_name: customer_first_name,
            last_name: customer_last_name,
            partner_id: backlog_referring_partner_id || partnerId,
            created_by: created_by || userId,
            created_time: new Date().toISOString(),
            deleted_flag: false
          });

          if (!customerError && newCustomer) {
            customerId = newCustomer.customer_id;
          }
        }
      }



      // ============================================
      // GET case_type_id FROM FRONTEND AND VALIDATE
      // ============================================
      let resolvedCaseTypeId = null;
      
      if (case_type_id) {
        const parsed = parseInt(case_type_id);
        if (!isNaN(parsed) && parsed > 0) {
          // Verify it exists in case_types table
          const { data: caseTypeCheck } = await supabase
            .from('case_types')
            .select('case_type_id, case_type_name')
            .eq('case_type_id', parsed)
            .eq('is_active', true)
            .single();

          if (caseTypeCheck) {
            resolvedCaseTypeId = parsed;
            console.log(`✓ Found case_type_id ${resolvedCaseTypeId} from case_types table: "${caseTypeCheck.case_type_name}"`);
          } else {
            console.warn(`⚠ case_type_id ${parsed} not found in case_types table`);
          }
        }
      }

      // If not found by ID, try by name
      if (!resolvedCaseTypeId && case_type) {
        const { data: caseTypeByName } = await supabase
          .from('case_types')
          .select('case_type_id, case_type_name')
          .eq('case_type_name', case_type)
          .eq('is_active', true)
          .single();

        if (caseTypeByName) {
          resolvedCaseTypeId = caseTypeByName.case_type_id;
          console.log(`✓ Found case_type_id ${resolvedCaseTypeId} by name "${case_type}"`);
        }
      }

      if (!resolvedCaseTypeId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid case_type_id or case_type. Could not find in case_types table.',
          statusCode: 400
        });
      }

      // Create backlog entry
      const backlogData = {
        backlog_id: backlogId,
        case_summary: task_summary,
        case_description: case_description,


        case_type_id: resolvedCaseTypeId, // Use resolved case_type_id
        backlog_referring_partner_id: backlog_referring_partner_id ? parseInt(backlog_referring_partner_id) : partnerId,
        backlog_referral_date: backlog_referral_date || new Date().toISOString().split('T')[0],
        created_by: created_by ? parseInt(created_by) : userId,
        created_time: created_date ? new Date(created_date).toISOString() : new Date().toISOString(),
        updated_by: updated_by || null,
        updated_time: new Date().toISOString(),
        status: status,
        deleted_flag: false
      };

      const { data: createdBacklog, error: backlogError } = await BacklogModel.create(backlogData);

      if (backlogError || !createdBacklog) {
        console.error('Error creating backlog:', backlogError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create backlog entry',
          statusCode: 500
        });
      }

      // Create comment
      if (comment_text) {
        await BacklogCommentModel.create({
          backlog_id: backlogId,
          comment_text: comment_text,
          created_by: created_by ? parseInt(created_by) : userId,
          updated_by: updated_by ? parseInt(updated_by) : null,
          created_time: new Date().toISOString(),
          updated_time: new Date().toISOString(),
          createdby_name: createdby_name || null,
          updatedby_name: updatedby_name || null,
          department: department
        });
      }



      // Handle documents (files) - Upload to Supabase Storage instead of local filesystem
      const documentCount = document_count ? parseInt(document_count) : 0;


      let filePath = null;
      let hasDocuments = false;
      
      console.log('=== DOCUMENT UPLOAD DEBUG ===');
      console.log('document_count:', document_count);
      console.log('documentCount (parsed):', documentCount);
      console.log('req.files:', req.files ? `Array with ${req.files.length} files` : 'null/undefined');
      console.log('req.files details:', req.files?.map(f => ({ fieldname: f.fieldname, originalname: f.originalname, size: f.size })));
      
      if (documentCount > 0 && req.files && req.files.length > 0) {


        hasDocuments = true;
        const documents = [];
        

        const filePaths = [];
        
        // Process uploaded files and upload to Supabase Storage
        for (let index = 0; index < req.files.length; index++) {
          const file = req.files[index]; // File is now in memory (buffer)
          
          console.log(`=== Processing file ${index} ===`);
          console.log('File object:', {
            fieldname: file.fieldname,
            originalname: file.originalname,
            encoding: file.encoding,
            mimetype: file.mimetype,
            size: file.size,
            hasBuffer: !!file.buffer,
            bufferLength: file.buffer?.length
          });
          
          // Check if file has buffer (required for memory storage)
          if (!file.buffer) {
            console.error(`File ${index} has no buffer! File object:`, file);
            continue; // Skip this file
          }
          
          const fileName = body[`document_${index}_name`] || file.originalname;
          const fileType = body[`document_${index}_type`] || file.mimetype;


          const fileTypeName = body[`document_${index}_type_name`] || 'Document';
          
          // Generate timestamp for file path (format: YYYYMMDD_HHMMSSmmm)
          const now = new Date();
          const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}`;
          
          // Get file extension
          const fileExt = path.extname(fileName);
          const baseFileName = path.basename(fileName, fileExt).replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize filename
          
          // Build storage path: bk-{backlog_id}/{document_type_name}_{original_filename}_{timestamp}.{ext}
          const storagePath = `bk-${backlogId}/${fileTypeName}_${baseFileName}_${timestamp}${fileExt}`;
          
          console.log(`Storage path: ${storagePath}`);
          
          // Upload file to Supabase Storage
          // Note: You need to create a bucket named 'backlog-documents' in Supabase Storage
          let publicUrl = storagePath; // Default to storage path
          let uploadSuccess = false;
          
          try {
            console.log(`Attempting to upload file ${index} to Supabase Storage...`);
            console.log(`Bucket: backlog-documents, Path: ${storagePath}, Size: ${file.buffer.length} bytes`);
            
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('backlog-documents')
              .upload(storagePath, file.buffer, {
                contentType: file.mimetype || 'application/octet-stream',
                upsert: false
              });
            
            if (uploadError) {
              console.error(`=== ERROR uploading file ${index} to Supabase Storage ===`);
              console.error('Error:', uploadError);
              console.error('Error message:', uploadError.message);
              console.error('Error statusCode:', uploadError.statusCode);
              console.error('Error error:', uploadError.error);
              console.error('Full error details:', JSON.stringify(uploadError, null, 2));
              
              // Still save document record even if Storage upload fails
              // Use storage path as file_path
              publicUrl = storagePath;
              console.log(`Will save document with path: ${publicUrl}`);
            } else {
              uploadSuccess = true;
              console.log(`✓ File ${index} uploaded successfully to Storage`);
              console.log('Upload data:', uploadData);
              
              // Get public URL for the uploaded file
              const { data: urlData } = supabase.storage
                .from('backlog-documents')
                .getPublicUrl(storagePath);
              
              console.log('URL data:', urlData);
              
              if (urlData?.publicUrl) {
                publicUrl = urlData.publicUrl;
                console.log(`Public URL: ${publicUrl}`);
              }
            }
          } catch (storageError) {
            console.error(`=== EXCEPTION uploading file ${index} to Supabase Storage ===`);
            console.error('Exception:', storageError);
            console.error('Exception message:', storageError.message);
            console.error('Exception stack:', storageError.stack);
            // Continue with database insert even if Storage fails
            publicUrl = storagePath;
          }
          
          // Build file path for response: bk-{backlog_id}/{document_type_name}_{original_filename}_{timestamp}.{ext}
          const formattedFilePath = `bk-${backlogId}/${fileTypeName}_${baseFileName}_${timestamp}${fileExt}`;
          filePaths.push(formattedFilePath);
          
          // ============================================
          // CATEGORY_ID PROCESSING WITH case_type_id
          // ============================================
          // Flow:
          // 1. Get case_type_id from frontend (already resolved above)
          // 2. Extract category info from request (category_id or custom name)
          // 3. If category_id provided → verify it exists
          // 4. If custom name provided → create/get category using case_type_id
          // 5. Store category_id in backlog_documents
          let categoryId = null;
          
          const docTypeField = body[`document_${index}_type`];
          const docTypeName = body[`document_${index}_type_name`];
          const docCustomName = body[`document_${index}_custom_name`];
          
          console.log(`\n=== CATEGORY PROCESSING for Document ${index} ===`);
          console.log(`  case_type_id from frontend: ${resolvedCaseTypeId}`);
          console.log(`  document_${index}_type:`, docTypeField);
          console.log(`  document_${index}_type_name:`, docTypeName);
          console.log(`  document_${index}_custom_name:`, docCustomName);
          console.log(`  selected_document_type:`, selected_document_type);
          
          // Step 1: Extract category information
          let categoryNameToCreate = null;
          let categoryIdRaw = null;
          
          // Priority 1: Check document-specific fields
          if (docTypeField !== undefined && docTypeField !== null && docTypeField !== '') {
            const strValue = String(docTypeField).trim();
            const parsed = parseInt(strValue, 10);
            
            if (!isNaN(parsed) && parsed > 0) {
              categoryIdRaw = parsed;
              console.log(`  → Found existing category_id: ${categoryIdRaw}`);
            } else if (strValue.toLowerCase() === 'other' || strValue.length > 0) {
              categoryNameToCreate = docCustomName || docTypeName || strValue;
              console.log(`  → Found custom category name: "${categoryNameToCreate}"`);
            }
          }
          
          // Priority 2: Check for custom name field
          if (!categoryIdRaw && !categoryNameToCreate && docCustomName) {
            categoryNameToCreate = docCustomName;
            console.log(`  → Found custom name: "${categoryNameToCreate}"`);
          }
          
          // Priority 3: Fallback to selected_document_type
          if (!categoryIdRaw && !categoryNameToCreate && selected_document_type) {
            const strValue = String(selected_document_type).trim();
            const parsed = parseInt(strValue, 10);
            
            if (!isNaN(parsed) && parsed > 0) {
              categoryIdRaw = parsed;
              console.log(`  → Using selected_document_type as category_id: ${categoryIdRaw}`);
            } else {
              categoryNameToCreate = selected_document_type_name || strValue;
              console.log(`  → Using selected_document_type_name: "${categoryNameToCreate}"`);
            }
          }
          
          // Step 2: Handle existing category_id
          if (categoryIdRaw) {
            // Verify it exists in document_categories table
            const { data: categoryCheck, error: categoryCheckError } = await supabase
              .from('document_categories')
              .select('category_id, document_name, case_type_id')
              .eq('category_id', categoryIdRaw)
              .single();
            
            if (categoryCheckError || !categoryCheck) {
              console.error(`  ✗ category_id ${categoryIdRaw} does NOT exist! Will create default category.`);
              categoryId = null; // Will be handled in Step 4
            } else {
              categoryId = categoryCheck.category_id;
              console.log(`  ✓ Verified category_id ${categoryId} exists: "${categoryCheck.document_name}"`);
              console.log(`    case_type_id: ${categoryCheck.case_type_id}`);
            }
          }
          
          // Step 3: Auto-create category if we have custom name AND case_type_id
          if (!categoryId && categoryNameToCreate && categoryNameToCreate.trim() !== '') {
            if (!resolvedCaseTypeId) {
              console.error(`  ✗ Cannot create category: case_type_id is required but missing!`);
              console.error(`    Category name: "${categoryNameToCreate}"`);
            } else {
              console.log(`  → Creating/getting category: "${categoryNameToCreate}" for case_type_id: ${resolvedCaseTypeId}`);
              
              // Check if category already exists with this case_type_id
              const { data: existingCategory } = await supabase
                .from('document_categories')
                .select('category_id, document_name, case_type_id')
                .eq('document_name', categoryNameToCreate.trim())
                .eq('case_type_id', resolvedCaseTypeId)
                .single();
              
              if (existingCategory) {
                categoryId = existingCategory.category_id;
                console.log(`  ✓ Category already exists, using category_id: ${categoryId}`);
              } else {
                // Get next category_id (manual auto-increment)
                const { data: maxCategory } = await supabase
                  .from('document_categories')
                  .select('category_id')
                  .order('category_id', { ascending: false })
                  .limit(1)
                  .single();

                const nextCategoryId = (maxCategory?.category_id || 0) + 1;

                // Create new category with case_type_id from frontend
                const categoryData = {
                  category_id: nextCategoryId,
                  case_type_id: resolvedCaseTypeId, // REQUIRED: from frontend
                  document_name: categoryNameToCreate.trim(),
                  is_mandatory: false,
                  is_active: true,
                  created_time: new Date().toISOString()
                };
                
                const { data: newCategory, error: createError } = await supabase
                  .from('document_categories')
                  .insert([categoryData])
                  .select()
                  .single();
                
                if (createError || !newCategory) {
                  console.error(`  ✗ Failed to create category:`, createError);
                  console.error(`    Category data:`, categoryData);
                  categoryId = null; // Will be handled in Step 4
                } else {
                  categoryId = newCategory.category_id;
                  console.log(`  ✓ Created new category with category_id: ${categoryId}`);
                  console.log(`    Category name: "${newCategory.document_name}"`);
                  console.log(`    case_type_id: ${newCategory.case_type_id}`);
                }
              }
            }
          }
          
          // Step 4: FINAL CHECK - ENSURE category_id is NEVER null
          // If still no category_id, create a default one using document_type_name or fileTypeName
          if (!categoryId) {
            if (!resolvedCaseTypeId) {
              console.error(`  ✗ CRITICAL: Cannot create default category - case_type_id is missing!`);
              return res.status(400).json({
                success: false,
                message: `Document ${index + 1}: Cannot create category - case_type_id is required`,
                statusCode: 400
              });
            }

            // Use document_type_name, fileTypeName, or default to "General Document"
            const defaultCategoryName = docTypeName || fileTypeName || selected_document_type_name || 'General Document';
            
            console.log(`  → Creating DEFAULT category: "${defaultCategoryName}" for case_type_id: ${resolvedCaseTypeId}`);
            
            // Check if default category already exists
            const { data: existingDefaultCategory } = await supabase
              .from('document_categories')
              .select('category_id, document_name, case_type_id')
              .eq('document_name', defaultCategoryName.trim())
              .eq('case_type_id', resolvedCaseTypeId)
              .single();
            
            if (existingDefaultCategory) {
              categoryId = existingDefaultCategory.category_id;
              console.log(`  ✓ Default category already exists, using category_id: ${categoryId}`);
            } else {
              // Get next category_id (manual auto-increment)
              const { data: maxCategory } = await supabase
                .from('document_categories')
                .select('category_id')
                .order('category_id', { ascending: false })
                .limit(1)
                .single();

              const nextCategoryId = (maxCategory?.category_id || 0) + 1;

              // Create default category
              const defaultCategoryData = {
                category_id: nextCategoryId,
                case_type_id: resolvedCaseTypeId,
                document_name: defaultCategoryName.trim(),
                is_mandatory: false,
                is_active: true,
                created_time: new Date().toISOString()
              };
              
              const { data: newDefaultCategory, error: createDefaultError } = await supabase
                .from('document_categories')
                .insert([defaultCategoryData])
                .select()
                .single();
              
              if (createDefaultError || !newDefaultCategory) {
                console.error(`  ✗ Failed to create default category:`, createDefaultError);
                return res.status(500).json({
                  success: false,
                  message: `Document ${index + 1}: Failed to create default category`,
                  error: createDefaultError?.message || 'Unknown error',
                  statusCode: 500
                });
              } else {
                categoryId = newDefaultCategory.category_id;
                console.log(`  ✓ Created default category with category_id: ${categoryId}`);
                console.log(`    Category name: "${newDefaultCategory.document_name}"`);
                console.log(`    case_type_id: ${newDefaultCategory.case_type_id}`);
              }
            }
          }
          
          // Final validation - category_id MUST exist at this point
          if (!categoryId) {
            console.error(`  ✗ CRITICAL ERROR: category_id is still NULL after all attempts!`);
            return res.status(500).json({
              success: false,
              message: `Document ${index + 1}: Failed to assign category_id - this should never happen`,
              statusCode: 500
            });
          }
          
          console.log(`  ✓ Final category_id: ${categoryId} (GUARANTEED NOT NULL)`);
          console.log(`=== FINAL category_id for Document ${index}: ${categoryId} ===\n`);
          
          let finalUserId = userId; // Use separate variable for userId
          
          // Validate backlog_id exists
          const { data: backlogCheck, error: backlogCheckError } = await supabase
            .from('backlog')
            .select('backlog_id')
            .eq('backlog_id', backlogId)
            .single();
          
          if (backlogCheckError || !backlogCheck) {
            console.error(`=== FOREIGN KEY ERROR: backlog_id ${backlogId} does not exist ===`);
            console.error('Backlog check error:', backlogCheckError);
          } else {
            console.log(`✓ Verified backlog_id ${backlogId} exists`);
          }
          
          // Check if uploaded_by (userId) exists (if provided)
          if (finalUserId) {
            const { data: userCheck, error: userCheckError } = await supabase
              .from('users')
              .select('user_id')
              .eq('user_id', finalUserId)
              .single();
            
            if (userCheckError || !userCheck) {
              console.error(`=== FOREIGN KEY ERROR: user_id ${finalUserId} does not exist ===`);
              console.error('User check error:', userCheckError);
              // Set to null if user doesn't exist
              finalUserId = null;
            } else {
              console.log(`✓ Verified user_id ${finalUserId} exists`);
            }
          } else {
            console.warn('⚠ No userId found for document upload - uploaded_by will be null');
          }

          // Build document object matching table structure exactly
          // Store the Supabase Storage path/URL in file_path
          // category_id is GUARANTEED to be set at this point (never null)
          const documentData = {
            backlog_id: backlogId,


            category_id: categoryId, // GUARANTEED NOT NULL
            original_filename: fileName || null,
            stored_filename: `${fileTypeName}_${baseFileName}_${timestamp}${fileExt}`,
            file_path: publicUrl || null, // Store Supabase Storage URL
            file_size: file.size ? file.size.toString() : null,
            file_type: fileTypeName || fileType || null,
            mime_type: file.mimetype || null,


            uploaded_by: finalUserId || null,
            upload_time: new Date().toISOString(),
            is_active: true,


            deleted_flag: false,
            is_customer_visible: true,
            version_number: 1
          };

          console.log(`Document ${index} prepared for database:`, {
            backlog_id: documentData.backlog_id,
            category_id: documentData.category_id,
            uploaded_by: documentData.uploaded_by,
            storagePath,
            uploadSuccess,
            publicUrl,
            fileName
          });
          documents.push(documentData);
        }

        if (documents.length > 0) {


          console.log('=== INSERTING DOCUMENTS INTO DATABASE ===');
          console.log('Number of documents to insert:', documents.length);
          console.log('Full documents data:', JSON.stringify(documents, null, 2));
          
          // Validate all required fields before insertion
          // Use for loop for async validation
          const validatedDocuments = [];
          for (let idx = 0; idx < documents.length; idx++) {
            const doc = documents[idx];
            const validated = { ...doc };
            
            // Ensure backlog_id is not null (required foreign key)
            if (!validated.backlog_id) {
              console.error(`Document ${idx}: backlog_id is missing!`);
            }
            
            // Ensure all text fields are strings or null
            validated.original_filename = validated.original_filename || null;
            validated.stored_filename = validated.stored_filename || null;
            validated.file_path = validated.file_path || null;
            validated.file_size = validated.file_size || null;
            validated.file_type = validated.file_type || null;
            validated.mime_type = validated.mime_type || null;
            
            // Ensure boolean fields are boolean
            validated.is_active = validated.is_active === true;
            validated.deleted_flag = validated.deleted_flag === false;
            validated.is_customer_visible = validated.is_customer_visible === true;
            
            // Ensure numeric fields are numbers or null
            validated.version_number = validated.version_number || 1;
            
            // category_id MUST NOT be null - validate it exists
            if (!validated.category_id) {
              console.error(`Document ${idx}: category_id is NULL - this should never happen!`);
              return res.status(500).json({
                success: false,
                message: `Document ${idx + 1}: category_id is missing - cannot save document without category`,
                statusCode: 500
              });
            }
            
            // Final validation: Verify category_id exists in document_categories
            const { data: finalCategoryCheck } = await supabase
              .from('document_categories')
              .select('category_id')
              .eq('category_id', validated.category_id)
              .single();
            
            if (!finalCategoryCheck) {
              console.error(`Document ${idx}: category_id ${validated.category_id} does NOT exist in document_categories!`);
              return res.status(400).json({
                success: false,
                message: `Document ${idx + 1}: Invalid category_id ${validated.category_id} - does not exist`,
                statusCode: 400
              });
            }
            
            validated.uploaded_by = validated.uploaded_by || null;
            
            console.log(`Validated document ${idx}:`, {
              backlog_id: validated.backlog_id,
              category_id: validated.category_id,
              uploaded_by: validated.uploaded_by,
              has_file_path: !!validated.file_path
            });
            
            validatedDocuments.push(validated);
          }
          
          const { data: insertedDocuments, error: docError } = await BacklogDocumentModel.createMultiple(validatedDocuments);
          
          if (docError) {
            console.error('=== ERROR INSERTING DOCUMENTS ===');
            console.error('Error object:', docError);
            console.error('Error message:', docError.message);
            console.error('Error code:', docError.code);
            console.error('Error hint:', docError.hint);
            console.error('Error details:', docError.details);
            console.error('Full error:', JSON.stringify(docError, null, 2));
            
            // Check for specific error types
            if (docError.code === '23503') {
              console.error('=== FOREIGN KEY CONSTRAINT VIOLATION ===');
              console.error('This means one of the foreign keys (backlog_id, category_id, or uploaded_by) does not exist in the referenced table');
            }
            
            if (docError.code === '23502') {
              console.error('=== NOT NULL CONSTRAINT VIOLATION ===');
              console.error('A required field is missing');
            }
            
            // Return error response so user knows documents weren't saved
            return res.status(500).json([{
              success: false,
              message: 'Backlog entry created but documents failed to save: ' + (docError.message || 'Unknown error'),
              backlog_id: backlogId,
              error: {
                message: docError.message,
                code: docError.code,
                hint: docError.hint,
                details: docError.details
              }
            }]);
          } else {
            console.log('=== SUCCESSFULLY INSERTED DOCUMENTS ===');
            console.log('Number of documents inserted:', insertedDocuments?.length || 0);
            if (insertedDocuments && insertedDocuments.length > 0) {
              console.log('Inserted document IDs:', insertedDocuments.map(d => d.document_id));
              console.log('Inserted documents:', JSON.stringify(insertedDocuments, null, 2));
            }
          }
          
          // Use the first file path for response
          filePath = filePaths.length > 0 ? filePaths[0] : null;
        } else {
          console.log('No documents to insert (documents array is empty)');
        }
      }

      // Build response message
      let message = 'Backlog entry created successfully';
      if (hasDocuments) {
        message += ' with documents. The email notification has been sent to the designated person in charge.';
      } else {
        message += '.';
      }

      // Return as array to match n8n response structure
      return res.status(200).json([{
        success: true,
        backlog_id: backlogId,
        ...(filePath && { file_path: filePath }),
        message: message
      }]);
    } catch (error) {
      console.error('Create backlog entry error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }



  // GET /api/backlog_id?backlog_id=ECSI-GA-25-029
  // Get backlog data by backlog_id with all nested relationships (similar to partner-status-check)
  static async getBacklogById(req, res) {
    try {
      const { backlog_id } = req.query;

      if (!backlog_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id query parameter is required',
          statusCode: 400
        });
      }

      console.log(`Fetching backlog data for backlog_id: ${backlog_id}`);

      // Fetch backlog with all nested relationships
      const { data: backlogData, error } = await BacklogModel.findByBacklogId(backlog_id);

      if (error) {
        console.error('Error fetching backlog:', error);
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

      // Return data as array (matching n8n webhook format)
      return res.status(200).json([backlogData]);

    } catch (error) {
      console.error('Get backlog by ID error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /public/backlog_id?backlog_id=ECSI-GA-25-030 - Public endpoint for backlog view (no auth required)
  static async publicGetBacklogById(req, res) {
    try {
      const { backlog_id } = req.query;

      if (!backlog_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id query parameter is required',
          statusCode: 400
        });
      }

      console.log(`[Public] Fetching backlog data for backlog_id: ${backlog_id}`);

      // Fetch backlog with all nested relationships
      const { data: backlogData, error } = await BacklogModel.findByBacklogId(backlog_id);

      if (error) {
        console.error('[Public] Error fetching backlog:', error);
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

      // Return data as array
      return res.status(200).json([backlogData]);

    } catch (error) {
      console.error('[Public] Get backlog by ID error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // PATCH /public/update_backlog - Public endpoint for updating backlog (no auth required)
  static async publicUpdateBacklog(req, res) {
    try {
      const { backlog_id, case_summary, case_description, case_type_id, ...otherFields } = req.body;

      if (!backlog_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id is required in request body',
          statusCode: 400
        });
      }

      console.log(`[Public] Updating backlog for backlog_id: ${backlog_id}`);

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

      // Validate case_type_id if provided
      if (case_type_id !== undefined && case_type_id !== null) {
        const { data: caseTypeCheck } = await supabase
          .from('case_types')
          .select('case_type_id')
          .eq('case_type_id', case_type_id)
          .single();

        if (!caseTypeCheck) {
          return res.status(400).json({
            status: 'error',
            message: `Invalid case_type_id: ${case_type_id} does not exist`,
            statusCode: 400
          });
        }
      }

      // Prepare update data
      const updateData = {};
      
      if (case_summary !== undefined) {
        updateData.case_summary = case_summary;
      }
      
      if (case_description !== undefined) {
        updateData.case_description = case_description;
      }
      
      if (case_type_id !== undefined && case_type_id !== null) {
        updateData.case_type_id = parseInt(case_type_id);
      }

      // Allow other fields to be updated if provided
      const allowedFields = [
        'status',
        'assigned_to',
        'assigned_consultant_name',
        'expert_description',
        'feedback',
        'backlog_referral_date',
        'updated_by'
      ];

      allowedFields.forEach(field => {
        if (otherFields[field] !== undefined) {
          updateData[field] = otherFields[field];
        }
      });

      // Always update updated_time
      updateData.updated_time = new Date().toISOString();

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No valid fields to update',
          statusCode: 400
        });
      }

      console.log(`[Public] Update data:`, updateData);

      // Update backlog in database
      const { data: updatedBacklog, error: updateError } = await BacklogModel.update(backlog_id, updateData);

      if (updateError) {
        console.error('[Public] Error updating backlog:', updateError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to update backlog',
          error: updateError.message || 'Unknown error',
          statusCode: 500
        });
      }

      // Return updated backlog data
      return res.status(200).json({
        status: 'success',
        message: 'Backlog updated successfully',
        data: updatedBacklog
      });

    } catch (error) {
      console.error('[Public] Update backlog error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // POST /public/comments_insert - Public endpoint for inserting backlog comments (no auth required)
  static async publicInsertComment(req, res) {
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

      console.log(`[Public] Inserting comment for backlog_id: ${backlog_id}`);

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
          console.warn(`[Public] Warning: created_by ${created_by} does not exist in users table`);
        }
      }

      if (updated_by) {
        const { data: userCheck } = await supabase
          .from('users')
          .select('user_id')
          .eq('user_id', parseInt(updated_by))
          .single();

        if (!userCheck) {
          console.warn(`[Public] Warning: updated_by ${updated_by} does not exist in users table`);
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

      console.log(`[Public] Comment data:`, {
        backlog_id: commentData.backlog_id,
        created_by: commentData.created_by,
        department: commentData.department,
        comment_length: commentData.comment_text.length
      });

      // Insert comment into database
      const { data: insertedComment, error: insertError } = await BacklogCommentModel.create(commentData);

      if (insertError) {
        console.error('[Public] Error inserting comment:', insertError);
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
      console.error('[Public] Insert comment error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // POST /public/partnerbacklogentrydoc - Public endpoint for adding document to existing backlog entry (no auth required)
  // Accepts: multipart/form-data with document (file), backlog_id, document_type
  static async publicAddDocumentToBacklog(req, res) {
    try {
      // Validate file upload
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'Document file is required',
          statusCode: 400
        });
      }

      const { backlog_id, document_type } = req.body;

      if (!backlog_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id is required',
          statusCode: 400
        });
      }

      if (!document_type) {
        return res.status(400).json({
          status: 'error',
          message: 'document_type is required',
          statusCode: 400
        });
      }

      console.log(`[Public] Adding document to backlog_id: ${backlog_id}`);
      console.log(`[Public] Document type: ${document_type}`);
      console.log(`[Public] File: ${req.file.originalname} (${req.file.size} bytes)`);

      // Step 1: Get backlog to find case_type_id
      const { data: backlogData, error: backlogError } = await supabase
        .from('backlog')
        .select('backlog_id, case_type_id')
        .eq('backlog_id', backlog_id)
        .single();

      if (backlogError || !backlogData) {
        console.error('[Public] Error fetching backlog:', backlogError);
        return res.status(404).json({
          status: 'error',
          message: `Backlog with ID ${backlog_id} not found`,
          statusCode: 404
        });
      }

      if (!backlogData.case_type_id) {
        return res.status(400).json({
          status: 'error',
          message: `Backlog ${backlog_id} does not have a case_type_id`,
          statusCode: 400
        });
      }

      console.log(`[Public] Step 1: Found backlog, case_type_id: ${backlogData.case_type_id}`);

      // Step 2: Get case_type_name to construct bucket name
      const { data: caseTypeData, error: caseTypeError } = await supabase
        .from('case_types')
        .select('case_type_name')
        .eq('case_type_id', backlogData.case_type_id)
        .single();

      if (caseTypeError || !caseTypeData) {
        console.error('[Public] Error fetching case_type:', caseTypeError);
        return res.status(500).json({
          status: 'error',
          message: 'Could not determine case type',
          statusCode: 500
        });
      }

      const caseTypeName = caseTypeData.case_type_name;
      const safeCaseType = caseTypeName.trim().toLowerCase().replace(/\s+/g, '-');
      const bucketName = `public-${safeCaseType}`;

      console.log(`[Public] Step 2: Bucket name: "${bucketName}"`);

      // Step 3: Get or create document category
      let categoryId = null;
      const { data: existingCategory } = await supabase
        .from('document_categories')
        .select('category_id, document_name, case_type_id')
        .eq('document_name', document_type.trim())
        .eq('case_type_id', backlogData.case_type_id)
        .single();

      if (existingCategory) {
        categoryId = existingCategory.category_id;
        console.log(`[Public] Step 3: Using existing category_id: ${categoryId}`);
      } else {
        // Create new category
        const { data: maxCategory } = await supabase
          .from('document_categories')
          .select('category_id')
          .order('category_id', { ascending: false })
          .limit(1)
          .single();

        const nextCategoryId = (maxCategory?.category_id || 0) + 1;

        const categoryData = {
          category_id: nextCategoryId,
          case_type_id: backlogData.case_type_id,
          document_name: document_type.trim(),
          is_mandatory: false,
          is_active: true,
          created_time: new Date().toISOString()
        };

        const { data: newCategory, error: createError } = await supabase
          .from('document_categories')
          .insert([categoryData])
          .select()
          .single();

        if (createError || !newCategory) {
          console.error('[Public] Error creating category:', createError);
          return res.status(500).json({
            status: 'error',
            message: 'Failed to create document category',
            error: createError?.message || 'Unknown error',
            statusCode: 500
          });
        }

        categoryId = newCategory.category_id;
        console.log(`[Public] Step 3: Created new category_id: ${categoryId}`);
      }

      // Step 4: Check if bucket exists, create if it doesn't
      console.log(`[Public] Step 4: Checking if bucket "${bucketName}" exists`);
      
      // Try to list buckets to check if it exists
      const { data: buckets, error: listBucketsError } = await supabase.storage.listBuckets();
      
      let bucketExists = false;
      if (!listBucketsError && buckets) {
        bucketExists = buckets.some(bucket => bucket.name === bucketName);
        console.log(`[Public] Bucket "${bucketName}" exists: ${bucketExists}`);
      }

      // If bucket doesn't exist, try to create it
      if (!bucketExists) {
        console.log(`[Public] Bucket "${bucketName}" does not exist, attempting to create...`);
        const { data: createBucketData, error: createBucketError } = await supabase.storage.createBucket(bucketName, {
          public: true, // Make bucket public
          allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
          fileSizeLimit: 10485760 // 10MB
        });

        if (createBucketError) {
          console.error('[Public] Error creating bucket:', createBucketError);
          // Try fallback bucket
          const fallbackBucket = 'backlog-documents';
          console.log(`[Public] Using fallback bucket: "${fallbackBucket}"`);
          bucketName = fallbackBucket;
        } else {
          console.log(`[Public] ✓ Successfully created bucket: "${bucketName}"`);
        }
      }

      // Step 5: Upload file to Supabase Storage
      const file = req.file;
      const fileName = file.originalname;
      const fileExt = path.extname(fileName);
      const baseFileName = path.basename(fileName, fileExt).replace(/[^a-zA-Z0-9]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
      
      const storagePath = `bk-${backlog_id}/${document_type}_${baseFileName}_${timestamp}${fileExt}`;
      
      console.log(`[Public] Step 5: Uploading to bucket: "${bucketName}", path: "${storagePath}"`);

      let publicUrl = storagePath;
      let uploadData = null;
      let finalBucketName = bucketName;
      
      const { data: uploadResult, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype || 'application/octet-stream',
          upsert: false
        });

      if (uploadError) {
        console.error('[Public] Error uploading file:', uploadError);
        
        // If bucket error, try fallback bucket
        if (uploadError.message && (uploadError.message.includes('Bucket') || uploadError.message.includes('not found'))) {
          const fallbackBucket = 'backlog-documents';
          console.log(`[Public] Retrying with fallback bucket: "${fallbackBucket}"`);
          
          const { data: retryUploadData, error: retryUploadError } = await supabase.storage
            .from(fallbackBucket)
            .upload(storagePath, file.buffer, {
              contentType: file.mimetype || 'application/octet-stream',
              upsert: false
            });

          if (retryUploadError) {
            return res.status(500).json({
              status: 'error',
              message: 'Failed to upload file to storage',
              error: retryUploadError.message || 'Unknown error',
              attempted_bucket: bucketName,
              fallback_bucket: fallbackBucket,
              statusCode: 500
            });
          }

          // Update bucket name for URL generation
          finalBucketName = fallbackBucket;
          uploadData = retryUploadData;
          console.log(`[Public] ✓ Successfully uploaded to fallback bucket: "${fallbackBucket}"`);
        } else {
          return res.status(500).json({
            status: 'error',
            message: 'Failed to upload file to storage',
            error: uploadError.message || 'Unknown error',
            statusCode: 500
          });
        }
      } else {
        uploadData = uploadResult;
        console.log(`[Public] ✓ Successfully uploaded to bucket: "${bucketName}"`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(finalBucketName)
        .getPublicUrl(storagePath);

      if (urlData?.publicUrl) {
        publicUrl = urlData.publicUrl;
      }

      console.log(`[Public] Step 4: File uploaded successfully`);

      // Step 5: Get next document_id
      const { data: maxDoc } = await supabase
        .from('backlog_documents')
        .select('document_id')
        .order('document_id', { ascending: false })
        .limit(1)
        .single();

      const nextDocumentId = (maxDoc?.document_id || 0) + 1;

      // Step 6: Insert document into backlog_documents table
      const documentData = {
        document_id: nextDocumentId,
        backlog_id: backlog_id,
        category_id: categoryId,
        original_filename: fileName,
        stored_filename: `${document_type}_${baseFileName}_${timestamp}${fileExt}`,
        file_path: publicUrl,
        file_size: file.size ? file.size.toString() : null,
        file_type: document_type,
        mime_type: file.mimetype || null,
        uploaded_by: null, // Can be added if needed
        upload_time: new Date().toISOString(),
        is_active: true,
        deleted_flag: false,
        is_customer_visible: true,
        version_number: 1
      };

      const { data: insertedDocument, error: insertError } = await supabase
        .from('backlog_documents')
        .insert([documentData])
        .select()
        .single();

      if (insertError) {
        console.error('[Public] Error inserting document:', insertError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to save document to database',
          error: insertError.message || 'Unknown error',
          statusCode: 500
        });
      }

      console.log(`[Public] Step 5: Document saved with document_id: ${insertedDocument.document_id}`);

      // Return success response
      return res.status(200).json({
        status: 'success',
        message: 'Document added successfully',
        data: {
          document_id: insertedDocument.document_id,
          backlog_id: backlog_id,
          file_path: publicUrl
        }
      });

    } catch (error) {
      console.error('[Public] Add document error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // GET /public/MyReferral?partner_id={partner_id}&page={page}&size={size} - Public endpoint for getting partner referrals (no auth required)
  static async publicGetReferrals(req, res) {
    try {
      const { partner_id, page, size } = req.query;

      if (!partner_id) {
        return res.status(400).json({
          status: 'error',
          message: 'partner_id parameter is required',
          statusCode: 400
        });
      }

      if (!Validators.isValidPartnerId(partner_id)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid partner_id',
          statusCode: 400
        });
      }

      console.log(`[Public] Fetching referrals for partner_id: ${partner_id}, page: ${page}, size: ${size}`);

      // If size=10000 or page/size not provided, return all referrals
      const sizeNum = size ? parseInt(size) : null;
      if (!page && !size || sizeNum === 10000) {
        // Return all referrals
        const { data: referrals, error } = await ReferralModel.findAllByPartnerId(partner_id);

        if (error) {
          console.error('[Public] Database error:', error);
          return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch referrals',
            statusCode: 500
          });
        }

        return res.status(200).json(referrals || []);
      } else {
        // Use pagination
        const pagination = Validators.validatePagination(page, size);
        const { data: referrals, error, count } = await ReferralModel.findByPartnerId(
          partner_id,
          pagination.page,
          pagination.size
        );

        if (error) {
          console.error('[Public] Database error:', error);
          return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch referrals',
            statusCode: 500
          });
        }

        return res.status(200).json(referrals || []);
      }
    } catch (error) {
      console.error('[Public] Get referrals error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        statusCode: 500
      });
    }
  }
}

export default PartnerController;





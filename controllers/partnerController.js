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
      const { partner_id } = req.body;

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

      console.log(`Checking partner status for partner_id: ${partner_id}`);

      // Get bonus calculations
      const { data: calculations, error: calcError } = await BonusModel.getBonusCalculations(partner_id);

      if (calcError) {
        console.error('Error fetching bonus calculations:', calcError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch bonus calculations',
          statusCode: 500
        });
      }

      // Calculate total bonus
      const { total: totalBonus } = await BonusModel.calculateTotalBonus(partner_id);

      // Format calculations with required fields
      const formattedCalculations = (calculations || []).map(calc => {
        const caseInfo = calc.cases || {};
        const customerInfo = caseInfo.customers || {};
        return {
          calculation_id: calc.calculation_id,
          case_id: calc.case_id,
          stage_bonus_amount: calc.stage_bonus_amount,
          case_value: calc.case_value || caseInfo.case_value,
          customer_first_name: customerInfo.first_name || null,
          customer_last_name: customerInfo.last_name || null,
          payment_date: calc.payment_date || calc.calculation_date,
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

      return res.status(200).json({
        status: 'success',
        partner_id: Number(partner_id),
        message: 'Partner status retrieved successfully',
        data: {
          total_calculations: formattedCalculations.length,
          calculations: formattedCalculations,
          total_bonus_amount: totalBonus || 0
        },
        timestamp: new Date().toISOString()
      });
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

      // Create backlog entry
      const backlogData = {
        backlog_id: backlogId,
        case_summary: task_summary,
        case_description: case_description,
        case_type_id: case_type_id ? parseInt(case_type_id) : null,
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

      // Handle documents (files)
      // req.files is provided by multer middleware
      const documentCount = document_count ? parseInt(document_count) : 0;
      if (documentCount > 0 && req.files && req.files.length > 0) {
        const documents = [];
        
        // Process uploaded files
        req.files.forEach((file, index) => {
          const fileName = body[`document_${index}_name`] || file.originalname;
          const fileType = body[`document_${index}_type`] || file.mimetype;
          const fileTypeName = body[`document_${index}_type_name`] || null;

          documents.push({
            backlog_id: backlogId,
            original_filename: fileName,
            stored_filename: file.filename,
            file_path: file.path,
            file_size: file.size?.toString() || null,
            file_type: fileType,
            mime_type: file.mimetype || null,
            uploaded_by: userId,
            upload_time: new Date().toISOString(),
            is_active: true,
            deleted_flag: false
          });
        });

        if (documents.length > 0) {
          await BacklogDocumentModel.createMultiple(documents);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Partner backlog entry created successfully',
        backlog_id: backlogId
      });
    } catch (error) {
      console.error('Create backlog entry error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }
}

export default PartnerController;


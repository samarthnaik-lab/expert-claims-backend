import PartnerModel from '../models/PartnerModel.js';
import ReferralModel from '../models/ReferralModel.js';
import BonusModel from '../models/BonusModel.js';
import CaseModel from '../models/CaseModel.js';
import CustomerModel from '../models/CustomerModel.js';
import UserModel from '../models/UserModel.js';
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
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Email configuration constants
const FROM_EMAIL = process.env.FROM_EMAIL || "analytics@expertclaims.co.in";
const LOGIN_URL = process.env.LOGIN_URL || "https://expert-claims-g8p9.vercel.app/login";

// SMTP transporter helper function
function getMailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.expertclaims.co.in",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || "analytics@expertclaims.co.in",
      pass: process.env.SMTP_PASS || "ExpertAnalysis@2025",
    },
    tls: {
      // Disable certificate hostname validation to handle certificate mismatch
      rejectUnauthorized: false
    },
    requireTLS: true,
  });
}

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
        partner_id,
        referring_partner_id,
        referral_date,
        case_value,
        service_amount,
        claim_amount,
        claims_amount, // Support both claim_amount and claims_amount
        updatedby_name,
        createdby_name
      } = req.body;

      // Get userId from req.user (if auth middleware is active) or extract from JWT token
      let userId = req.user?.user_id;
      
      // If userId is not available, try to extract from JWT token in Authorization header
      if (!userId) {
        try {
          const authHeader = req.headers['authorization'] || req.headers['Authorization'];
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const jwtToken = authHeader.substring(7);
            // Decode JWT token to get user_id (without verification for now)
            const tokenParts = jwtToken.split('.');
            if (tokenParts.length === 3) {
              // Decode base64url (JWT uses base64url encoding, not standard base64)
              const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
              const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
              userId = payload.user_id || payload.userId || null;
              console.log('[Partner] Extracted userId from JWT token:', userId);
            }
          }
        } catch (jwtError) {
          console.warn('[Partner] Could not extract userId from JWT token:', jwtError.message);
        }
      }
      
      // Fallback: Try to get userId from request body if available
      if (!userId && req.body.created_by) {
        userId = parseInt(req.body.created_by);
        console.log('[Partner] Using userId from request body created_by:', userId);
      }
      
      console.log('[Partner] createTask - final userId:', userId);
      
      // Use referring_partner_id from payload, or fallback to partner_id, or get from user
      let partnerId = null;
      if (referring_partner_id) {
        partnerId = parseInt(referring_partner_id);
      } else if (partner_id) {
        partnerId = parseInt(partner_id);
      } else if (userId) {
        const { data: partner } = await PartnerModel.findByUserId(userId);
        partnerId = partner?.partner_id || null;
      }
      
      if (!partnerId) {
        return res.status(400).json([{
          message: 'Partner not found',
          case_id: null
        }]);
      }

      if (!case_Summary || !case_description) {
        return res.status(400).json([{
          message: 'case_Summary and case_description are required',
          case_id: null
        }]);
      }

      // Generate case_id
      const caseId = await IdGenerator.generateCaseId();

      // Handle customer - update existing or create new
      let customerId = null;
      let customerCreated = false;
      
      if (customer) {
        // If customer_id exists, update the customer
        if (customer.customer_id) {
          customerId = parseInt(customer.customer_id);
          
          // Update existing customer with new data
          const customerUpdateData = {
            first_name: customer.firstName || null,
            last_name: customer.lastName || null,
            email_address: customer.email || null,
            mobile_number: customer.mobileNumber || null,
            emergency_contact: customer.emergencyContact || null,
            gender: customer.gender || null,
            age: customer.age ? String(customer.age) : null,
            address: customer.address || null,
            customer_type: customer.customerType || null,
            communication_preferences: customer.communicationPreference || null,
            source: customer.source || null,
            language_preference: customer.languagePreference || null,
            notes: customer.notes || null,
            gstin: customer.gstin || null,
            pan: customer.pan || null,
            state: customer.state || null,
            pincode: customer.pincode || null,
            partner_id: partnerId,
            updated_by: userId,
            updated_time: new Date().toISOString()
          };

          // Remove null/undefined values
          Object.keys(customerUpdateData).forEach(key => {
            if (customerUpdateData[key] === null || customerUpdateData[key] === undefined || customerUpdateData[key] === '') {
              delete customerUpdateData[key];
            }
          });

          if (Object.keys(customerUpdateData).length > 0) {
            await CustomerModel.update(customerId, customerUpdateData);
          }
        } else if (customer.firstName && customer.lastName) {
          // Create new customer
          const { data: existingCustomer } = await CustomerModel.findByName(
            customer.firstName,
            customer.lastName,
            partnerId
          );

          if (existingCustomer) {
            customerId = existingCustomer.customer_id;
          } else {
            // Step 1: Check if user already exists with email or mobile number
            let existingUser = null;
            let customerUserId = null;

            if (customer.email) {
              const { data: userByEmail } = await UserModel.findByEmail(customer.email);
              if (userByEmail) {
                existingUser = userByEmail;
                customerUserId = userByEmail.user_id;
              }
            }

            // If not found by email, try mobile number
            if (!existingUser && customer.mobileNumber) {
              const { data: userByMobile } = await UserModel.findByMobileAndRole(customer.mobileNumber, 'customer');
              if (userByMobile) {
                existingUser = userByMobile;
                customerUserId = userByMobile.user_id;
              }
            }

            // Step 2: Create user entry if it doesn't exist
            if (!existingUser) {
              // Get next user_id by finding max and incrementing
              const { data: maxUsers, error: maxUserError } = await supabase
                .from('users')
                .select('user_id')
                .order('user_id', { ascending: false })
                .limit(1);

              let nextUserId = 1;
              if (!maxUserError && maxUsers && maxUsers.length > 0 && maxUsers[0].user_id) {
                nextUserId = parseInt(maxUsers[0].user_id) + 1;
              }

              // Generate username from email or mobile number
              const username = customer.email 
                ? customer.email.split('@')[0] 
                : (customer.mobileNumber ? `customer_${customer.mobileNumber}` : `customer_${nextUserId}`);

              // Auto-generate password hash from first_name + last_name + timestamp
              const passwordString = `${customer.firstName}${customer.lastName}${Date.now()}`;
              const passwordHash = await bcrypt.hash(passwordString, 10);

              const now = new Date().toISOString();
              const userData = {
                user_id: nextUserId,
                username: username,
                email: customer.email || null,
                mobile_number: customer.mobileNumber || null,
                password_hash: passwordHash,
                role: 'customer',
                status: 'active',
                created_time: now,
                updated_time: now,
                deleted_flag: false
              };

              const { data: newUser, error: userError } = await supabase
                .from('users')
                .insert([userData])
                .select('user_id')
                .single();

              if (userError || !newUser) {
                console.error('[Partner] Error creating user for customer:', userError);
                return res.status(500).json([{
                  message: 'Failed to create user for customer',
                  case_id: null,
                  error: userError?.message || 'Unknown error'
                }]);
              }

              customerUserId = newUser.user_id;
              console.log(`[Partner] Created user for customer: user_id=${customerUserId}`);
            }

            // Step 3: Get next customer_id by finding max and incrementing
            const { data: maxCustomers, error: maxCustomerError } = await supabase
              .from('customers')
              .select('customer_id')
              .order('customer_id', { ascending: false })
              .limit(1);

            let nextCustomerId = 1;
            if (!maxCustomerError && maxCustomers && maxCustomers.length > 0 && maxCustomers[0].customer_id) {
              nextCustomerId = parseInt(maxCustomers[0].customer_id) + 1;
            }

            // Step 4: Create customer record with user_id
            const { data: newCustomer, error: customerError } = await CustomerModel.create({
              customer_id: nextCustomerId,
              user_id: customerUserId, // Link to user
              first_name: customer.firstName,
              last_name: customer.lastName,
              email_address: customer.email || null,
              mobile_number: customer.mobileNumber || null,
              emergency_contact: customer.emergencyContact || null,
              gender: customer.gender || null,
              age: customer.age ? String(customer.age) : null,
              address: customer.address || null,
              customer_type: customer.customerType || null,
              communication_preferences: customer.communicationPreference || null,
              source: customer.source || null,
              language_preference: customer.languagePreference || null,
              notes: customer.notes || null,
              gstin: customer.gstin || null,
              pan: customer.pan || null,
              state: customer.state || null,
              pincode: customer.pincode || null,
              partner_id: partnerId,
              created_by: userId,
              created_time: new Date().toISOString(),
              deleted_flag: false
            });

            if (!customerError && newCustomer) {
              customerId = newCustomer.customer_id;
              customerCreated = true;
              console.log(`[Partner] Created customer: customer_id=${customerId}, user_id=${customerUserId}`);
            } else {
              console.error('[Partner] Error creating customer:', customerError);
              // Rollback: Delete user if customer creation failed
              if (customerUserId && !existingUser) {
                await supabase.from('users').delete().eq('user_id', customerUserId);
                console.log(`[Partner] Rolled back user creation: user_id=${customerUserId}`);
              }
              return res.status(500).json([{
                message: 'Failed to create customer record',
                case_id: null,
                error: customerError?.message || 'Unknown error'
              }]);
            }
          }
        }
      }

      // Get case_type_id from caseType
      const caseTypeId = caseType ? parseInt(caseType) : null;

      // Parse amounts
      const parsedCaseValue = case_value ? parseInt(case_value) : null;
      const parsedServiceAmount = service_amount ? String(service_amount) : null;
      // Support both claim_amount and claims_amount field names
      const parsedClaimAmount = (claim_amount || claims_amount) ? String(claim_amount || claims_amount) : null;

      // Determine bonus_eligible: if referring_partner_id exists, default to false unless explicitly set
      // The constraint chk_bonus_eligibility requires bonus_eligible to be explicitly set when referring_partner_id is not null
      let bonusEligible = false; // Default to false
      if (req.body.bonus_eligible !== undefined && req.body.bonus_eligible !== null) {
        bonusEligible = req.body.bonus_eligible === true || req.body.bonus_eligible === 'true';
      }

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
        referral_date: referral_date || new Date().toISOString().split('T')[0],
        case_value: parsedCaseValue,
        "service amount": parsedServiceAmount,
        "claim amount": parsedClaimAmount,
        customer_id: customerId,
        bonus_eligible: bonusEligible, // Explicitly set bonus_eligible to satisfy constraint
        created_by: userId,
        created_time: new Date().toISOString(),
        deleted_flag: false
      };

      const { data: createdCase, error: caseError } = await CaseModel.create(caseData);

      if (caseError || !createdCase) {
        console.error('Error creating case:', caseError);
        console.error('Case data attempted:', JSON.stringify(caseData, null, 2));
        
        // Check for constraint violations
        let errorMessage = 'Failed to create case';
        if (caseError && caseError.message) {
          if (caseError.message.includes('chk_bonus_eligibility')) {
            errorMessage = 'Bonus eligibility constraint violation: bonus_eligible must be explicitly set when referring_partner_id is provided';
          } else if (caseError.message.includes('foreign key')) {
            if (caseError.message.includes('case_type_id')) {
              errorMessage = `Invalid case_type_id: ${caseTypeId} does not exist in case_types table`;
            } else if (caseError.message.includes('assigned_to')) {
              errorMessage = `Invalid assigned_to: ${assignedTo} does not exist in employees table`;
            } else if (caseError.message.includes('referring_partner_id')) {
              errorMessage = `Invalid referring_partner_id: ${partnerId} does not exist in partners table`;
            } else if (caseError.message.includes('customer_id')) {
              errorMessage = `Invalid customer_id: ${customerId} does not exist in customers table`;
            } else if (caseError.message.includes('created_by')) {
              errorMessage = `Invalid created_by: ${userId} does not exist in users table`;
            } else {
              errorMessage = `Foreign key constraint violation: ${caseError.message}`;
            }
          } else {
            errorMessage = caseError.message;
          }
        }
        
        return res.status(500).json([{
          message: errorMessage,
          case_id: null,
          error: caseError?.message || 'Unknown error',
          details: {
            case_id: caseId,
            case_type_id: caseTypeId,
            assigned_to: assignedTo,
            referring_partner_id: partnerId,
            customer_id: customerId,
            created_by: userId
          }
        }]);
      }

      // Create stakeholders
      if (stakeholders && Array.isArray(stakeholders) && stakeholders.length > 0) {
        // Get next stakeholder_id by finding max and incrementing
        const { data: maxStakeholders, error: maxStakeholderError } = await supabase
          .from('case_stakeholders')
          .select('stakeholder_id')
          .order('stakeholder_id', { ascending: false })
          .limit(1);

        let nextStakeholderId = 1;
        if (!maxStakeholderError && maxStakeholders && maxStakeholders.length > 0 && maxStakeholders[0].stakeholder_id) {
          nextStakeholderId = parseInt(maxStakeholders[0].stakeholder_id) + 1;
        }

        const stakeholdersData = stakeholders.map((stakeholder, index) => ({
          stakeholder_id: nextStakeholderId + index, // Generate unique IDs for each stakeholder
          case_id: caseId,
          stakeholder_name: stakeholder.name || stakeholder.stakeholder_name,
          contact_email: stakeholder.email || stakeholder.contactEmail || stakeholder.contact_email,
          contact_phone: stakeholder.phone || stakeholder.contact_phone ? parseInt(stakeholder.phone || stakeholder.contact_phone) : null,
          role: stakeholder.role || null,
          notes: stakeholder.notes || null,
          created_by: userId,
          created_time: new Date().toISOString()
        }));

        const { data: createdStakeholders, error: stakeholderError } = await StakeholderModel.createMultiple(stakeholdersData);
        
        if (stakeholderError) {
          console.error('[Partner] Error creating stakeholders:', stakeholderError);
          console.error('[Partner] Stakeholder data:', JSON.stringify(stakeholdersData, null, 2));
          // Don't fail the entire request if stakeholder creation fails
        } else {
          console.log('[Partner] Stakeholders created successfully:', createdStakeholders?.length || 0);
        }
      }

      // Create comment
      console.log('[Partner] Comment check - comments:', comments, 'type:', typeof comments, 'trimmed:', comments ? comments.trim() : 'N/A');
      if (comments && typeof comments === 'string' && comments.trim() !== '') {
        console.log('[Partner] Creating comment for case_id:', caseId, 'userId:', userId);
        try {
          // Get next comment_id by finding max and incrementing
          const { data: maxComments, error: maxCommentError } = await supabase
            .from('case_comments')
            .select('comment_id')
            .order('comment_id', { ascending: false })
            .limit(1);

          let nextCommentId = 1;
          if (!maxCommentError && maxComments && maxComments.length > 0 && maxComments[0].comment_id) {
            nextCommentId = parseInt(maxComments[0].comment_id) + 1;
          }
          console.log('[Partner] Next comment_id:', nextCommentId);

          const commentData = {
            comment_id: nextCommentId,
            case_id: caseId,
            user_id: userId || null, // Allow null if userId is not available
            comment_text: comments.trim(),
            is_internal: internal === 'true' || internal === true,
            created_time: new Date().toISOString()
          };

          console.log('[Partner] Inserting comment with data:', JSON.stringify(commentData, null, 2));
          const { data: createdComment, error: commentError } = await CommentModel.create(commentData);

          if (commentError) {
            console.error('[Partner] Error creating comment:', commentError);
            console.error('[Partner] Comment error details:', JSON.stringify(commentError, null, 2));
            console.error('[Partner] Comment data that failed:', JSON.stringify(commentData, null, 2));
            // Don't fail the entire request if comment creation fails, just log it
          } else {
            console.log('[Partner] Comment created successfully:', createdComment?.comment_id);
            console.log('[Partner] Created comment:', JSON.stringify(createdComment, null, 2));
          }
        } catch (commentErr) {
          console.error('[Partner] Exception while creating comment:', commentErr);
          console.error('[Partner] Exception stack:', commentErr.stack);
          // Don't fail the entire request if comment creation fails
        }
      } else {
        console.log('[Partner] Comment not created - condition failed. comments:', comments, 'isString:', typeof comments === 'string', 'trimmedLength:', comments && typeof comments === 'string' ? comments.trim().length : 0);
      }

      // Create payment phases
      if (payments && Array.isArray(payments) && payments.length > 0) {
        // Note: case_phase_id is GENERATED ALWAYS (auto-incrementing), so we don't set it manually
        const paymentsData = payments.map((payment) => {
          // Build payment data - ensure all NOT NULL fields are set
          const paymentData = {
            // case_phase_id is auto-generated by database - don't include it
            case_id: caseId, // Required NOT NULL
            phase_name: payment.phase_name || payment.name, // Required NOT NULL
            case_type_id: caseTypeId, // Required NOT NULL
            phase_amount: payment.phase_amount ? parseInt(payment.phase_amount) : (payment.amount ? parseInt(payment.amount) : 0), // Required NOT NULL - default to 0
            status: payment.status || 'pending', // Required NOT NULL
            paid_amount: payment.paid_amount ? parseInt(payment.paid_amount) : 0, // Required NOT NULL with default 0
            created_by: userId || 1, // Required NOT NULL - use system user (1) as fallback
            created_time: new Date().toISOString()
          };

          // Add optional fields only if they have values
          if (payment.due_date || payment.dueDate) {
            paymentData.due_date = payment.due_date || payment.dueDate;
          }
          if (payment.payment_date) {
            paymentData.payment_date = payment.payment_date;
          }
          if (payment.payment_method) {
            paymentData.payment_method = payment.payment_method;
          }
          if (payment.transaction_reference) {
            paymentData.transaction_reference = payment.transaction_reference;
          }
          if (payment.invoice_number) {
            paymentData.invoice_number = payment.invoice_number;
          }
          if (payment.notes) {
            paymentData.notes = payment.notes;
          }

          return paymentData;
        });

        const { data: createdPayments, error: paymentError } = await PaymentModel.createMultiple(paymentsData);
        
        if (paymentError) {
          console.error('[Partner] Error creating payment phases:', paymentError);
          console.error('[Partner] Payment data:', JSON.stringify(paymentsData, null, 2));
          // Don't fail the entire request if payment creation fails
        } else {
          console.log('[Partner] Payment phases created successfully:', createdPayments?.length || 0);
        }
      }

      // Create initial case_stage_history entry
      if (ticket_Stage) {
        // Get next stage_history_id by finding max and incrementing
        const { data: maxHistory, error: maxHistoryError } = await supabase
          .from('case_stage_history')
          .select('stage_history_id')
          .order('stage_history_id', { ascending: false })
          .limit(1);

        let nextHistoryId = 1;
        if (!maxHistoryError && maxHistory && maxHistory.length > 0 && maxHistory[0].stage_history_id) {
          nextHistoryId = parseInt(maxHistory[0].stage_history_id) + 1;
        }

        const stageHistoryData = {
          stage_history_id: nextHistoryId,
          case_id: caseId,
          previous_stage: null, // No previous stage for initial entry
          new_stage: ticket_Stage,
          changed_by: userId,
          changed_to: assignedTo ? parseInt(assignedTo) : null,
          changed_reason: 'Case created',
          created_by: userId,
          created_time: new Date().toISOString(),
          deleted_flag: false
        };

        const { error: historyError } = await supabase
          .from('case_stage_history')
          .insert([stageHistoryData]);

        if (historyError) {
          console.error('[Partner] Error creating stage history:', historyError);
          // Don't fail the entire request if stage history creation fails
        }
      }

      // Return response in the expected format
      return res.status(200).json([{
        message: customerCreated ? "Customer added sucess" : "Task created successfully",
        case_id: caseId
      }]);
    } catch (error) {
      console.error('Create task error:', error);
      return res.status(500).json([{
        message: 'Internal server error: ' + error.message,
        case_id: null
      }]);
    }
  }

  // POST /api/partnerbacklogentry
  static async createPartnerBacklogEntry(req, res) {
    try {
      // Authentication is handled separately, so req.user may not be available
      // Use created_by from request body instead
      const userId = req.user?.user_id || null;
      
      // Get partner_id from partners table by user_id (if available)
      // Otherwise, use backlog_referring_partner_id from request body
      let partnerId = null;
      if (userId) {
        const { data: partner } = await PartnerModel.findByUserId(userId);
        partnerId = partner?.partner_id || null;
      }
      
      // Note: partnerId can be null if no user authentication - will use backlog_referring_partner_id from body

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

      // ============================================
      // RESOLVE PARTNER_ID FROM backlog_referring_partner_id
      // The incoming value might be either partner_id OR user_id
      // ============================================
      let finalPartnerId = null;
      
      if (backlog_referring_partner_id) {
        const incomingId = parseInt(backlog_referring_partner_id);
        
        // First, try to find partner by partner_id
        const { data: partnerById, error: partnerByIdError } = await supabase
          .from('partners')
          .select('partner_id')
          .eq('partner_id', incomingId)
          .eq('deleted_flag', false)
          .maybeSingle();

        if (partnerByIdError) {
          console.error('Error checking partner by partner_id:', partnerByIdError);
          return res.status(400).json({
            success: false,
            message: `Error validating partner: ${incomingId}`,
            statusCode: 400,
            error_details: partnerByIdError?.message || 'Database error'
          });
        }

        if (partnerById) {
          // Found by partner_id - use it directly
          finalPartnerId = partnerById.partner_id;
          console.log(`✓ Found partner by partner_id: ${finalPartnerId}`);
        } else {
          // Not found by partner_id, try to find by user_id
          console.log(`⚠ Value ${incomingId} not found as partner_id, checking if it's a user_id...`);
          const { data: partnerByUserId, error: partnerByUserIdError } = await PartnerModel.findByUserId(incomingId);
          
          if (partnerByUserIdError) {
            console.error('Error checking partner by user_id:', partnerByUserIdError);
            return res.status(400).json({
              success: false,
              message: `Error validating partner by user_id: ${incomingId}`,
              statusCode: 400,
              error_details: partnerByUserIdError?.message || 'Database error'
            });
          }

          if (partnerByUserId && partnerByUserId.partner_id) {
            // Found by user_id - use the partner_id
            finalPartnerId = partnerByUserId.partner_id;
            console.log(`✓ Found partner by user_id ${incomingId}: partner_id = ${finalPartnerId}`);
          } else {
            // Not found as either partner_id or user_id
            console.error(`Partner validation failed: ${incomingId} is neither a valid partner_id nor user_id`);
            return res.status(400).json({
              success: false,
              message: `Invalid backlog_referring_partner_id: ${incomingId} does not exist as a partner_id or user_id in partners table.`,
              statusCode: 400,
              error_details: 'Partner not found'
            });
          }
        }
      } else if (partnerId) {
        // Use partnerId from authenticated user if available
        finalPartnerId = partnerId;
        console.log(`✓ Using partner_id from authenticated user: ${finalPartnerId}`);
      }

      if (!finalPartnerId) {
        return res.status(400).json({
          success: false,
          message: 'backlog_referring_partner_id is required and must be a valid partner_id or user_id.',
          statusCode: 400
        });
      }

      // Final validation: ensure the resolved partner_id exists and is not deleted
      const { data: finalPartnerCheck, error: finalPartnerCheckError } = await supabase
        .from('partners')
        .select('partner_id')
        .eq('partner_id', finalPartnerId)
        .eq('deleted_flag', false)
        .maybeSingle();

      if (finalPartnerCheckError || !finalPartnerCheck) {
        console.error(`Final partner validation failed: partner_id ${finalPartnerId} not found`);
        return res.status(400).json({
          success: false,
          message: `Invalid partner_id: ${finalPartnerId} does not exist in partners table or has been deleted.`,
          statusCode: 400,
          error_details: 'Partner not found'
        });
      }
      
      console.log(`✓ Final validated partner_id: ${finalPartnerId}`);

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

      // Create or find customer (using validated finalPartnerId)
      let customerId = null;
      if (customer_first_name && customer_last_name) {
        const { data: existingCustomer } = await CustomerModel.findByName(
          customer_first_name,
          customer_last_name,
          finalPartnerId
        );

        if (existingCustomer) {
          customerId = existingCustomer.customer_id;
        } else {
          // According to schema, mobile_number and age are required fields
          // Use placeholder values if not provided
          const customerData = {
            first_name: customer_first_name,
            last_name: customer_last_name || null, // Can be null per schema
            mobile_number: body.mobile_number || '0000000000', // Required - use placeholder if not provided
            age: body.age ? parseInt(body.age) : 0, // Required - use 0 if not provided (must be 0-120 per constraint)
            partner_id: finalPartnerId,
            created_by: created_by ? parseInt(created_by) : (userId ? parseInt(userId) : null),
            created_time: new Date().toISOString(),
            deleted_flag: false
          };
          
          const { data: newCustomer, error: customerError } = await CustomerModel.create(customerData);

          if (customerError) {
            console.error('Error creating customer:', customerError);
            // Don't fail the entire request if customer creation fails
            // Just log the error and continue without customer_id
          } else if (newCustomer) {
            customerId = newCustomer.customer_id;
          }
        }
      }

      // Format backlog_referral_date as date string (YYYY-MM-DD)
      let formattedReferralDate = null;
      if (backlog_referral_date) {
        // If it's already in YYYY-MM-DD format, use it
        if (typeof backlog_referral_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(backlog_referral_date)) {
          formattedReferralDate = backlog_referral_date;
        } else {
          // Try to parse and format
          const dateObj = new Date(backlog_referral_date);
          if (!isNaN(dateObj.getTime())) {
            formattedReferralDate = dateObj.toISOString().split('T')[0];
          }
        }
      }
      // Default to today if not provided
      if (!formattedReferralDate) {
        formattedReferralDate = new Date().toISOString().split('T')[0];
      }

      // Create backlog entry
      // Note: According to schema, created_by and updated_by in backlog table are TEXT, not integer
      const backlogData = {
        backlog_id: backlogId,
        case_summary: task_summary,
        case_description: case_description,
        case_type_id: resolvedCaseTypeId, // Use resolved case_type_id
        backlog_referring_partner_id: finalPartnerId,
        backlog_referral_date: formattedReferralDate,
        created_by: created_by ? String(created_by) : (userId ? String(userId) : null), // Convert to text
        created_time: created_date ? new Date(created_date).toISOString() : new Date().toISOString(),
        updated_by: updated_by ? String(updated_by) : null, // Convert to text
        updated_time: new Date().toISOString(),
        status: status || 'New', // Default to 'New' per schema
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
      // Note: According to schema, created_by and updated_by in backlog_comments are INTEGER, not text
      if (comment_text) {
        const commentCreatedBy = created_by ? parseInt(created_by) : (userId ? parseInt(userId) : null);
        const commentUpdatedBy = updated_by ? parseInt(updated_by) : null;
        
        await BacklogCommentModel.create({
          backlog_id: backlogId,
          comment_text: comment_text,
          created_by: commentCreatedBy,
          updated_by: commentUpdatedBy,
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
      
      // Get case_type_name to construct dynamic bucket name (matching n8n workflow)
      let caseTypeName = null;
      let bucketName = 'backlog-documents'; // Fallback bucket
      
      if (resolvedCaseTypeId) {
        const { data: caseTypeData } = await supabase
          .from('case_types')
          .select('case_type_name')
          .eq('case_type_id', resolvedCaseTypeId)
          .single();
        
        if (caseTypeData) {
          caseTypeName = caseTypeData.case_type_name;
          console.log(`✓ Found case_type_name: "${caseTypeName}"`);
          
          // Construct bucket name: expc-{case_type_name} (matching n8n workflow)
          const safeCaseType = caseTypeName
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-');
          bucketName = `expc-${safeCaseType}`;
          console.log(`✓ Using dynamic bucket: "${bucketName}"`);
        }
      }
      
      // Note: S3 buckets must be created manually in AWS Console
      // Using bucket name: expc-{case_type_name}
      console.log(`Using S3 bucket: "${bucketName}"`);
      
      console.log('=== DOCUMENT UPLOAD DEBUG ===');
      console.log('document_count:', document_count);
      console.log('documentCount (parsed):', documentCount);
      console.log('req.files:', req.files ? `Array with ${req.files.length} files` : 'null/undefined');
      console.log('req.files details:', req.files?.map(f => ({ fieldname: f.fieldname, originalname: f.originalname, size: f.size })));
      console.log(`Final bucket name: "${bucketName}"`);
      
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
          
          // Upload file to AWS S3
          let uploadSuccess = false;
          
          try {
            console.log(`Attempting to upload file ${index} to S3...`);
            console.log(`Bucket: ${bucketName}, Path: ${storagePath}, Size: ${file.buffer.length} bytes`);
            console.log(`File buffer type: ${typeof file.buffer}, is Buffer: ${Buffer.isBuffer(file.buffer)}`);
            
            // Ensure we have a valid buffer
            if (!file.buffer || file.buffer.length === 0) {
              throw new Error('File buffer is empty or invalid');
            }
            
            // Upload to S3
            const command = new PutObjectCommand({
              Bucket: bucketName,
              Key: storagePath,
              Body: file.buffer,
              ContentType: file.mimetype || 'application/octet-stream'
            });
            
            await s3Client.send(command);
            uploadSuccess = true;
            console.log(`✓ File ${index} uploaded successfully to S3`);
            
          } catch (s3Error) {
            console.error(`=== ERROR uploading file ${index} to S3 ===`);
            console.error('Error:', s3Error);
            console.error('Error message:', s3Error.message);
            console.error('Full error details:', JSON.stringify(s3Error, null, 2));
            // Don't continue - throw error to prevent saving invalid record
            throw new Error(`S3 upload failed: ${s3Error.message || 'Unknown error'}`);
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
          
          // Determine uploaded_by user_id - required field (NOT NULL in schema)
          // Priority: 1) authenticated userId, 2) created_by from request body, 3) use finalPartnerId's user_id
          let finalUserId = userId ? parseInt(userId) : null;
          
          if (!finalUserId && created_by) {
            finalUserId = parseInt(created_by);
            console.log(`Using created_by from request body as uploaded_by: ${finalUserId}`);
          }
          
          // If still no userId, try to get user_id from partner
          if (!finalUserId && finalPartnerId) {
            const { data: partnerData } = await supabase
              .from('partners')
              .select('user_id')
              .eq('partner_id', finalPartnerId)
              .maybeSingle();
            
            if (partnerData?.user_id) {
              finalUserId = parseInt(partnerData.user_id);
              console.log(`Using partner's user_id as uploaded_by: ${finalUserId}`);
            }
          }
          
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
          
          // Validate uploaded_by (userId) exists - REQUIRED field (NOT NULL)
          if (!finalUserId) {
            console.error('=== ERROR: uploaded_by is required but no user_id found ===');
            return res.status(400).json({
              success: false,
              message: `Document ${index + 1}: uploaded_by is required. Please provide a valid user_id or ensure authentication is enabled.`,
              statusCode: 400
            });
          }
          
          // Verify user_id exists in users table
          const { data: userCheck, error: userCheckError } = await supabase
            .from('users')
            .select('user_id')
            .eq('user_id', finalUserId)
            .maybeSingle();
          
          if (userCheckError) {
            console.error(`=== ERROR validating user_id ${finalUserId} ===`);
            console.error('User check error:', userCheckError);
            return res.status(400).json({
              success: false,
              message: `Document ${index + 1}: Invalid user_id ${finalUserId} - does not exist in users table`,
              statusCode: 400
            });
          }
          
          if (!userCheck) {
            console.error(`=== FOREIGN KEY ERROR: user_id ${finalUserId} does not exist ===`);
            return res.status(400).json({
              success: false,
              message: `Document ${index + 1}: Invalid user_id ${finalUserId} - does not exist in users table`,
              statusCode: 400
            });
          }
          
          console.log(`✓ Verified user_id ${finalUserId} exists and will be used for uploaded_by`);

          // Build document object matching table structure exactly
          // Store the Supabase Storage path/URL in file_path
          // category_id is GUARANTEED to be set at this point (never null)
          const documentData = {
            backlog_id: backlogId,


            category_id: categoryId, // GUARANTEED NOT NULL
            original_filename: fileName || null,
            stored_filename: `${fileTypeName}_${baseFileName}_${timestamp}${fileExt}`,
            file_path: storagePath, // Store S3 path (e.g., "bk-{backlog_id}/{filename}")
            file_size: file.size ? file.size.toString() : null,
            file_type: fileTypeName || fileType || null,
            mime_type: file.mimetype || null,


            uploaded_by: finalUserId, // REQUIRED - already validated above
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
            validated.deleted_flag = false; // Always set to false for new documents
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
            
            // uploaded_by is REQUIRED (NOT NULL) - ensure it's set
            if (!validated.uploaded_by) {
              console.error(`Document ${idx}: uploaded_by is NULL - this should never happen after validation!`);
              return res.status(500).json({
                success: false,
                message: `Document ${idx + 1}: uploaded_by is missing - cannot save document without uploaded_by`,
                statusCode: 500
              });
            }
            
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

      // Step 5: Insert document into backlog_documents table
      // Note: document_id is GENERATED ALWAYS AS IDENTITY - don't set it manually
      const documentData = {
        // document_id is auto-generated by database - don't include it
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

  // PATCH /public/removedocument?document_id={document_id} - Remove document (soft delete - set deleted_flag to true)
  static async publicRemoveDocument(req, res) {
    try {
      const { document_id } = req.query;

      if (!document_id) {
        return res.status(400).json({
          status: 'error',
          message: 'document_id query parameter is required',
          statusCode: 400
        });
      }

      console.log(`[Public] Removing document: document_id=${document_id}`);

      // Update deleted_flag to true (soft delete)
      const { data: updatedDocument, error: updateError } = await supabase
        .from('backlog_documents')
        .update({ 
          deleted_flag: true
        })
        .eq('document_id', document_id)
        .select()
        .single();

      if (updateError) {
        console.error('[Public] Error updating document:', updateError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to remove document',
          error: updateError.message || 'Unknown error',
          statusCode: 500
        });
      }

      if (!updatedDocument) {
        return res.status(404).json({
          status: 'error',
          message: `Document with ID ${document_id} not found`,
          statusCode: 404
        });
      }

      console.log(`[Public] Document ${document_id} marked as deleted (deleted_flag=true)`);

      return res.status(200).json([{
        status: 'success',
        message: 'Deleted document successfully'
      }]);

    } catch (error) {
      console.error('[Public] Remove document error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Internal server error: ' + error.message,
        statusCode: 500
      });
    }
  }

  // PATCH /api/feedback - Update feedback for a backlog entry
  static async updateFeedback(req, res) {
    try {
      const { backlog_id, feedback } = req.body;

      // Validate required fields
      if (!backlog_id) {
        return res.status(400).json({
          status: 'error',
          message: 'backlog_id is required',
          statusCode: 400
        });
      }

      if (feedback === undefined || feedback === null) {
        return res.status(400).json({
          status: 'error',
          message: 'feedback is required',
          statusCode: 400
        });
      }

      console.log(`[Partner] Updating feedback for backlog_id: ${backlog_id}`);

      // Prepare update data
      const updateData = {
        feedback: feedback,
        updated_time: new Date().toISOString()
      };

      // Update backlog entry
      const { data: updatedBacklog, error } = await BacklogModel.update(backlog_id, updateData);

      if (error) {
        console.error('[Partner] Error updating feedback:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to update feedback',
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

      // Email notification logic
      try {
        // Fetch backlog details to get assigned_to information
        const { data: backlogDetails, error: backlogFetchError } = await supabase
          .from('backlog')
          .select('backlog_id, assigned_to, assigned_consultant_name, backlog_referring_partner_id')
          .eq('backlog_id', backlog_id)
          .single();

        if (!backlogFetchError && backlogDetails) {
          // Check if assigned_to exists
          if (!backlogDetails.assigned_to) {
            console.warn(`[Partner] assigned_to missing for backlog: ${backlog_id}`);
          } else {
            // Get employee's user_id
            const { data: employeeData, error: employeeError } = await supabase
              .from('employees')
              .select('user_id')
              .eq('employee_id', backlogDetails.assigned_to)
              .single();

            if (!employeeError && employeeData?.user_id) {
              // Get user's email
              const { data: userData, error: userError } = await supabase
                .from('users')
                .select('email')
                .eq('user_id', employeeData.user_id)
                .single();

              if (!userError && userData?.email) {
                const transporter = getMailer();

                const mailText =
                  `Dear Sir/Madam,\n\n` +
                  `Assignment ${backlog_id} has been updated for Gap Analysis.\n` +
                  `Please review the feedback below:\n\n` +
                  `Feedback: ${feedback || ""}\n` +
                  `Click here to visit ${LOGIN_URL}\n\n` +
                  `Best Regards,\nExpert Claim Solutions Team`;

                await transporter.sendMail({
                  from: FROM_EMAIL,
                  to: userData.email,
                  subject: "Expert Claims Policy Assigned",
                  text: mailText,
                });

                console.log(`[Partner] Email sent to consultant for feedback update`, {
                  backlog_id: backlog_id,
                  email: userData.email,
                  employee_id: backlogDetails.assigned_to
                });
              } else {
                console.warn(`[Partner] Could not find consultant email`, {
                  backlog_id: backlog_id,
                  employee_id: backlogDetails.assigned_to,
                  user_id: employeeData.user_id,
                  error: userError?.message
                });
              }
            } else {
              console.warn(`[Partner] Could not find employee user_id`, {
                backlog_id: backlog_id,
                employee_id: backlogDetails.assigned_to,
                error: employeeError?.message
              });
            }
          }
        } else {
          console.warn(`[Partner] Could not fetch backlog details for email notification`, {
            backlog_id: backlog_id,
            error: backlogFetchError?.message
          });
        }
      } catch (emailError) {
        // Log email error but don't fail the request
        console.error('[Partner] Error sending email notification:', emailError);
      }

      // Return updated backlog data
      return res.status(200).json({
        status: 'success',
        message: 'Feedback updated successfully',
        data: updatedBacklog,
        statusCode: 200
      });

    } catch (error) {
      console.error('[Partner] Update feedback error:', error);
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

  // POST /webhook/partner_creation
  // Create a new partner with user account
  static async createPartner(req, res) {
    try {
      const { user, partner } = req.body;

      console.log('[Partner] Creating partner:', { email: user?.email, username: user?.username });

      // Validate required fields
      const fieldErrors = {};

      // Validate user object
      if (!user) {
        fieldErrors.user = 'User object is required';
      } else {
        if (!user.username) fieldErrors['user.username'] = 'Username is required';
        if (!user.email) fieldErrors['user.email'] = 'Email is required';
        if (!user.password_hash) fieldErrors['user.password_hash'] = 'Password hash is required';
        if (!user.mobile_number) fieldErrors['user.mobile_number'] = 'Mobile number is required';
        if (!user.role) fieldErrors['user.role'] = 'Role is required';
        if (user.role && user.role.toLowerCase() !== 'partner') {
          fieldErrors['user.role'] = 'Role must be "partner"';
        }
      }

      // Validate partner object
      if (!partner) {
        fieldErrors.partner = 'Partner object is required';
      } else {
        if (!partner.first_name) fieldErrors['partner.first_name'] = 'First name is required';
        if (!partner.last_name) fieldErrors['partner.last_name'] = 'Last name is required';
        if (!partner.mobile_number) fieldErrors['partner.mobile_number'] = 'Mobile number is required';
        if (!partner.emergency_contact) fieldErrors['partner.emergency_contact'] = 'Emergency contact is required';
        if (!partner.partner_type) fieldErrors['partner.partner_type'] = 'Partner type is required';
      }

      if (Object.keys(fieldErrors).length > 0) {
        return res.status(200).json([{
          status: 'error',
          message: 'Validation failed',
          error_code: 'PARTNER_002',
          field_errors: fieldErrors
        }]);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(user.email)) {
        return res.status(200).json([{
          status: 'error',
          message: 'Validation failed',
          error_code: 'PARTNER_002',
          field_errors: {
            'user.email': 'Invalid email format'
          }
        }]);
      }

      // Check if email or username already exists
      const { data: existingUsers, error: checkError } = await supabase
        .from('users')
        .select('user_id, email, username')
        .or(`email.eq.${user.email},username.eq.${user.username}`);

      if (checkError) {
        console.error('[Partner] Error checking existing users:', checkError);
        return res.status(200).json([{
          status: 'error',
          message: 'Failed to check existing users',
          error_code: 'PARTNER_003'
        }]);
      }

      if (existingUsers && existingUsers.length > 0) {
        const fieldErrors = {};
        const emailExists = existingUsers.some(u => u.email === user.email);
        const usernameExists = existingUsers.some(u => u.username === user.username);

        if (emailExists) {
          fieldErrors['user.email'] = 'Email address is already registered';
        }
        if (usernameExists) {
          fieldErrors['user.username'] = 'Username is already taken';
        }

        return res.status(200).json([{
          status: 'error',
          message: emailExists && usernameExists
            ? 'Email and username already exist'
            : emailExists
              ? 'Email already exists'
              : 'Username already exists',
          error_code: 'PARTNER_001',
          field_errors: fieldErrors
        }]);
      }

      // Generate user_id
      const { data: maxUsers, error: maxUserError } = await supabase
        .from('users')
        .select('user_id')
        .order('user_id', { ascending: false })
        .limit(1);

      let nextUserId = 1;
      if (!maxUserError && maxUsers && maxUsers.length > 0 && maxUsers[0].user_id) {
        nextUserId = parseInt(maxUsers[0].user_id) + 1;
      }

      // Generate partner_id
      const { data: maxPartners, error: maxPartnerError } = await supabase
        .from('partners')
        .select('partner_id')
        .order('partner_id', { ascending: false })
        .limit(1);

      let nextPartnerId = 1;
      if (!maxPartnerError && maxPartners && maxPartners.length > 0 && maxPartners[0].partner_id) {
        nextPartnerId = parseInt(maxPartners[0].partner_id) + 1;
      }

      const now = new Date().toISOString();

      // Create user in users table
      const userData = {
        user_id: nextUserId,
        username: user.username,
        email: user.email,
        mobile_number: user.mobile_number || null,
        password_hash: user.password_hash,
        role: 'partner',
        status: 'active',
        created_time: now,
        updated_time: now,
        deleted_flag: false
      };

      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert([userData])
        .select('user_id, username, email, role, created_time')
        .single();

      if (userError || !newUser) {
        console.error('[Partner] Error creating user:', userError);
        return res.status(200).json([{
          status: 'error',
          message: 'Failed to create user',
          error_code: 'PARTNER_003',
          error_details: userError?.message || 'Unknown error'
        }]);
      }

      const userId = newUser.user_id;

      // Create partner record
      const partnerData = {
        partner_id: nextPartnerId,
        user_id: userId,
        first_name: partner.first_name,
        last_name: partner.last_name,
        mobile_number: partner.mobile_number || null,
        emergency_contact: partner.emergency_contact || null,
        gender: partner.gender || 'male',
        age: partner.age ? parseInt(partner.age) : 30,
        address: partner.address || 'Address not provided',
        partner_type: partner.partner_type,
        'name of entity': partner.entity_name || null,
        created_by: partner.created_by ? parseInt(partner.created_by) : 1,
        updated_by: partner.updated_by ? parseInt(partner.updated_by) : 1,
        created_at: now,
        updated_at: now,
        deleted_flag: false
      };

      // Add optional fields if provided
      if (partner.gstin !== undefined) partnerData.gstin = partner.gstin || null;
      if (partner.pan !== undefined) partnerData.pan = partner.pan || null;
      if (partner.state !== undefined) partnerData.state = partner.state || null;
      if (partner.pincode !== undefined) partnerData.pincode = partner.pincode || null;
      if (partner.license_id !== undefined) partnerData.license_id = partner.license_id || null;
      if (partner.license_expire_date !== undefined) partnerData.license_expire_date = partner.license_expire_date || null;

      const { data: newPartner, error: partnerError } = await supabase
        .from('partners')
        .insert([partnerData])
        .select('partner_id, first_name, last_name, partner_type, created_at, updated_at')
        .single();

      if (partnerError || !newPartner) {
        console.error('[Partner] Error creating partner:', partnerError);
        // Rollback user creation
        await supabase.from('users').delete().eq('user_id', userId);
        return res.status(200).json([{
          status: 'error',
          message: 'Failed to create partner record',
          error_code: 'PARTNER_003',
          error_details: partnerError?.message || 'Unknown error'
        }]);
      }

      // Return success response
      return res.status(200).json([{
        status: 'success',
        message: 'Partner created successfully',
        data: {
          user_id: userId,
          partner_id: newPartner.partner_id,
          username: newUser.username,
          email: newUser.email,
          mobile_number: user.mobile_number,
          role: 'partner',
          first_name: newPartner.first_name,
          last_name: newPartner.last_name,
          partner_type: newPartner.partner_type,
          entity_name: partnerData['name of entity'],
          created_at: newPartner.created_at,
          updated_at: newPartner.updated_at
        }
      }]);

    } catch (error) {
      console.error('[Partner] Create partner error:', error);
      return res.status(200).json([{
        status: 'error',
        message: 'Internal server error',
        error_code: 'PARTNER_003',
        error_details: error.message
      }]);
    }
  }
}

export default PartnerController;






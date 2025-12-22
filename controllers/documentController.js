import axios from 'axios';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import logger from '../utils/logger.js';
import supabase from '../config/database.js';

// AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Supabase configuration - Use service role key for private expc schema access
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wrbnlvgecznyqelryjeq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
  'Accept-Profile': 'expc',
  'Content-Profile': 'expc' // Required for POST/PUT/PATCH operations
};

class DocumentController {
  // Helper: Validate user session
  static async validateSession(sessionId, jwtToken) {
    try {
      const response = await axios.get(
        `${SUPABASE_URL}/rest/v1/user_session_details`,
        {
          params: {
            session_id: `eq.${sessionId}`,
            jwt_token: `eq.${jwtToken}`,
            deleted_flag: 'eq.false'
          },
          headers: supabaseHeaders
        }
      );
      
      if (response.data && response.data.length > 0) {
        return {
          valid: true,
          userId: response.data[0].user_id,
          sessionId: response.data[0].session_id,
          jwtToken: response.data[0].jwt_token
        };
      }
      return { valid: false };
    } catch (error) {
      logger.logError(error, null, {
        errorType: 'SessionValidationError',
        message: error.message,
        sessionId: sessionId
      });
      return { valid: false };
    }
  }

  // Helper: Get case details
  static async getCaseDetails(caseId) {
    try {
      const response = await axios.get(
        `${SUPABASE_URL}/rest/v1/cases`,
        {
          params: {
            case_id: `eq.${caseId}`,
            deleted_flag: 'eq.false',
            select: '*'
          },
          headers: supabaseHeaders
        }
      );
      
      if (response.data && response.data.length > 0) {
        return response.data[0];
      }
      
      logger.logError(new Error('Case not found'), null, {
        errorType: 'GetCaseDetailsError',
        message: `Case with ID ${caseId} not found or deleted`,
        caseId: caseId
      });
      
      return null;
    } catch (error) {
      logger.logError(error, null, {
        errorType: 'GetCaseDetailsError',
        message: error.message,
        caseId: caseId,
        status: error.response?.status
      });
      return null;
    }
  }

  // Helper: Get case type name
  static async getCaseTypeName(caseTypeId) {
    try {
      const response = await axios.get(
        `${SUPABASE_URL}/rest/v1/case_types`,
        {
          params: {
            case_type_id: `eq.${caseTypeId}`,
            select: 'case_type_name'
          },
          headers: supabaseHeaders
        }
      );
      
      if (response.data && response.data.length > 0) {
        const caseTypeName = response.data[0].case_type_name;
        return caseTypeName.trim().toLowerCase().replace(/\s+/g, '-');
      }
      return 'default';
    } catch (error) {
      logger.logError(error, null, {
        errorType: 'GetCaseTypeError',
        message: error.message,
        caseTypeId: caseTypeId
      });
      return 'default';
    }
  }

  // Helper: Get document category details (name and case_type_id)
  static async getDocumentCategory(categoryId) {
    try {
      const response = await axios.get(
        `${SUPABASE_URL}/rest/v1/document_categories`,
        {
          params: {
            category_id: `eq.${categoryId}`,
            select: 'document_name,case_type_id'
          },
          headers: supabaseHeaders
        }
      );
      
      if (response.data && response.data.length > 0) {
        return {
          document_name: response.data[0].document_name || 'document',
          case_type_id: response.data[0].case_type_id
        };
      }
      return { document_name: 'document', case_type_id: null };
    } catch (error) {
      logger.logError(error, null, {
        errorType: 'GetDocumentCategoryError',
        message: error.message,
        categoryId: categoryId
      });
      return { document_name: 'document', case_type_id: null };
    }
  }

  // Helper: Get document name from category (kept for backward compatibility)
  static async getDocumentName(categoryId) {
    const category = await DocumentController.getDocumentCategory(categoryId);
    return category.document_name;
  }

  // Helper: Get latest version number
  static async getLatestVersion(caseId, categoryId) {
    try {
      const response = await axios.get(
        `${SUPABASE_URL}/rest/v1/case_documents`,
        {
          params: {
            case_id: `eq.${caseId}`,
            category_id: `eq.${categoryId}`,
            select: 'version_number',
            order: 'version_number.desc',
            limit: 1
          },
          headers: supabaseHeaders
        }
      );
      
      if (response.data && response.data.length > 0) {
        return response.data[0].version_number + 1;
      }
      return 1;
    } catch (error) {
      logger.logError(error, null, {
        errorType: 'GetLatestVersionError',
        message: error.message,
        caseId: caseId,
        categoryId: categoryId
      });
      return 1;
    }
  }

  // Helper: Generate stored filename with version
  static generateStoredFilename(originalFilename, documentName, versionNumber) {
    const dotIndex = originalFilename.lastIndexOf('.');
    const base = dotIndex >= 0 ? originalFilename.slice(0, dotIndex) : originalFilename;
    const ext = dotIndex >= 0 ? originalFilename.slice(dotIndex + 1) : '';
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedDocName = documentName.trim().replace(/[\/\\]+/g, '-');
    
    return `${sanitizedDocName}_${base}_v${versionNumber}_${timestamp}${ext ? '.' + ext : ''}`;
  }

  // Helper: Upload to S3
  static async uploadToS3(bucketName, filePath, fileBuffer, mimeType) {
    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: filePath,
        Body: fileBuffer,
        ContentType: mimeType
      });
      
      await s3Client.send(command);
      return { success: true };
    } catch (error) {
      logger.logError(error, null, {
        errorType: 'S3UploadError',
        message: error.message,
        bucket: bucketName,
        filePath: filePath
      });
      return { success: false, error: error.message };
    }
  }

  // Helper: Save document metadata to database
  static async saveDocumentMetadata(data) {
    try {
      const response = await axios.post(
        `${SUPABASE_URL}/rest/v1/case_documents`,
        data,
        {
          headers: {
            ...supabaseHeaders,
            'Prefer': 'return=representation'
          }
        }
      );
      
      return { success: true, data: response.data };
    } catch (error) {
      // Extract detailed error message from Supabase/PostgREST response
      const errorDetails = error.response?.data || {};
      const errorMessage = errorDetails.message || errorDetails.hint || error.message;
      const errorCode = errorDetails.code || 'UNKNOWN_ERROR';
      
      logger.logError(error, null, {
        errorType: 'SaveDocumentMetadataError',
        message: errorMessage,
        errorCode: errorCode,
        caseId: data.case_id,
        status: error.response?.status,
        details: errorDetails.details
      });
      
      return { 
        success: false, 
        error: errorMessage,
        errorCode: errorCode,
        details: errorDetails
      };
    }
  }

  // Main upload endpoint
  static async uploadDocument(req, res) {
    try {
      // Extract headers and body
      const jwt_token = req.headers['jwt_token'] || req.headers['jwt-token'];
      const session_id = req.headers['session_id'] || req.headers['session-id'];
      const { case_id, category_id, is_customer_visible } = req.body;
      const file = req.file;

      // Validate required fields (file, case_id, category_id are required)
      if (!case_id || !category_id || !file) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: case_id, category_id, or file',
          statusCode: 400
        });
      }

      // Step 1: Validate session (optional - only if headers are provided)
      let userId = null;
      if (jwt_token && session_id) {
        const session = await DocumentController.validateSession(session_id, jwt_token);
        if (session.valid) {
          userId = session.userId;
        }
        // If session validation fails, continue without authentication
        // This allows uploads without login
      }

      // Step 2: Get case details (to verify case exists)
      const caseDetails = await DocumentController.getCaseDetails(case_id);
      if (!caseDetails) {
        return res.status(404).json({
          success: false,
          error: 'Case not found',
          statusCode: 404
        });
      }

      // Step 3: Get document category details (includes case_type_id)
      const categoryDetails = await DocumentController.getDocumentCategory(category_id);
      if (!categoryDetails.case_type_id) {
        return res.status(400).json({
          success: false,
          error: 'Category does not have a valid case_type_id',
          statusCode: 400
        });
      }

      // Step 4: Get case type name from category's case_type_id (for bucket naming)
      const caseTypeName = await DocumentController.getCaseTypeName(categoryDetails.case_type_id);
      const bucketName = `expc-${caseTypeName}`;

      // Step 5: Get document name from category
      const documentName = categoryDetails.document_name;

      // Step 6: Get latest version number
      const versionNumber = await DocumentController.getLatestVersion(case_id, category_id);

      // Step 7: Generate stored filename
      const storedFilename = DocumentController.generateStoredFilename(
        file.originalname,
        documentName,
        versionNumber
      );
      const filePath = `${case_id}/${storedFilename}`;

      // Step 8: Upload to S3
      const uploadResult = await DocumentController.uploadToS3(
        bucketName,
        filePath,
        file.buffer,
        file.mimetype
      );

      if (!uploadResult.success) {
        return res.status(500).json({
          success: false,
          error: `S3 upload failed: ${uploadResult.error}`,
          statusCode: 500
        });
      }

      // Step 9: Save metadata to database
      // Note: document_id is GENERATED ALWAYS (auto-incrementing), so we don't set it manually
      // uploaded_by is NOT NULL, so we need to provide a value - use system user (1) if not authenticated
      const metadata = {
        // document_id is auto-generated by database - don't include it
        case_id,
        category_id: parseInt(category_id), // Ensure it's a number
        original_filename: file.originalname,
        stored_filename: storedFilename,
        file_path: filePath,
        file_size: file.size,
        file_type: file.originalname.split('.').pop(),
        mime_type: file.mimetype,
        uploaded_by: userId || 1, // Use system user (1) as fallback if not authenticated
        upload_time: new Date().toISOString(), // Required timestamp
        version_number: versionNumber,
        is_customer_visible: is_customer_visible === 'true' || is_customer_visible === true,
        is_active: true, // Required boolean
        deleted_flag: false // Required boolean
      };

      const saveResult = await DocumentController.saveDocumentMetadata(metadata);

      if (!saveResult.success) {
        // Return appropriate status code based on error
        const statusCode = saveResult.errorCode === 'PGRST205' ? 404 : 
                          saveResult.errorCode === '428C9' ? 400 : 500;
        
        return res.status(statusCode).json({
          success: false,
          error: saveResult.error || 'Database save failed',
          error_code: saveResult.errorCode,
          details: saveResult.details,
          statusCode: statusCode
        });
      }

      // Success response
      return res.status(200).json({
        success: true,
        case_id,
        document_id: saveResult.data[0].document_id,
        bucket: bucketName,
        file_path: filePath,
        message: 'File uploaded successfully',
        statusCode: 200
      });
    } catch (error) {
      logger.logError(error, req, {
        errorType: 'DocumentUploadError',
        route: req.path,
        method: req.method
      });
      return res.status(500).json({
        success: false,
        error: error.message,
        statusCode: 500
      });
    }
  }

  // Health check endpoint
  static async healthCheck(req, res) {
    res.json({ 
      status: 'ok', 
      message: 'Document upload service is running',
      statusCode: 200
    });
  }
}

export default DocumentController;


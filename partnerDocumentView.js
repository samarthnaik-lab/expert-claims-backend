// partnerDocumentView.js - View/download partner backlog documents from S3

const express = require('express');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, apikey, jwt_token, session_id, Accept-Profile, Content-Profile');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const PORT = process.env.PORT || 3000;

// AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Supabase configuration - Use service role key for private expc schema access
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate required environment variables
if (!SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY must be set in environment variables for private schema access');
  process.exit(1);
}

const supabaseHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Accept-Profile': 'expc',
  'Content-Profile': 'expc'
};

// Helper: Validate user session
// Session validation with jwt_token and session_id commented out
async function validateSession(sessionId, jwtToken) {
  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/user_session_details`,
      {
        params: {
          session_id: `eq.${sessionId}`,
          jwt_token: `eq.${jwtToken}`,
          deleted_flag: 'is.false'
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
    console.error('Session validation error:', error.message);
    return { valid: false };
  }
}

// Helper: Get backlog document details
async function getBacklogDocumentDetails(documentId) {
  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/backlog_documents`,
      {
        params: {
          document_id: `eq.${documentId}`,
          deleted_flag: 'is.false',
          select: 'document_id,backlog_id,file_path'
        },
        headers: supabaseHeaders
      }
    );
    if (response.data && response.data.length > 0) {
      return response.data[0];
    }
    return null;
  } catch (error) {
    console.error('Get backlog document details error:', error.message);
    return null;
  }
}

// Helper: Get backlog details with case type
async function getBacklogDetailsWithType(backlogId) {
  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/backlog`,
      {
        params: {
          backlog_id: `eq.${backlogId}`,
          select: 'backlog_id,case_type_id,case_types(case_type_name)'
        },
        headers: supabaseHeaders
      }
    );
    if (response.data && response.data.length > 0) {
      return response.data[0];
    }
    return null;
  } catch (error) {
    console.error('Get backlog details error:', error.message);
    return null;
  }
}

// Helper: Build bucket name from case type
function buildBucketName(caseTypeName) {
  const safeCaseType = caseTypeName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  
  return `expc-${safeCaseType}`;
}

// Helper: Download file from S3
async function downloadFromS3(bucketName, filePath) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: filePath
    });
    const response = await s3Client.send(command);
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return {
      success: true,
      buffer,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      source: 'S3'
    };
  } catch (error) {
    console.error('S3 download error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Main endpoint: View/Download partner backlog document
app.post('/partnerdocumentview', async (req, res) => {
  try {
    // apikey, authorization, jwt_token, and session_id validation commented out
    // const { jwt_token, session_id, apikey } = req.headers;
    const { document_id } = req.body;

    // Validate required fields
    // apikey, jwt_token, and session_id validation commented out
    // if (!jwt_token || !session_id || !apikey) {
    //   return res.status(401).json({
    //     success: false,
    //     error: 'Missing authentication headers'
    //   });
    // }

    if (!document_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing document_id in request body'
      });
    }

    // Step 1: Validate session - commented out
    // const session = await validateSession(session_id, jwt_token);
    // 
    // if (!session.valid) {
    //   return res.status(401).json({
    //     success: false,
    //     error: 'Invalid session. Please login again.'
    //   });
    // }

    // Additional validation: Check if apikey matches - commented out
    // if (apikey !== SUPABASE_KEY) {
    //   return res.status(401).json({
    //     success: false,
    //     error: 'Invalid API key'
    //   });
    // }

    console.log(`[View Document] Fetching backlog document_id: ${document_id}`);

    // Step 2: Get backlog document details
    const documentDetails = await getBacklogDocumentDetails(document_id);
    
    if (!documentDetails) {
      console.error(`[View Document] Document not found for document_id: ${document_id}`);
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    console.log(`[View Document] Found document: file_path=${documentDetails.file_path}, backlog_id=${documentDetails.backlog_id}`);

    // Step 3: Get backlog details with case type
    const backlogDetails = await getBacklogDetailsWithType(documentDetails.backlog_id);
    if (!backlogDetails || !backlogDetails.case_types) {
      console.error(`[View Document] Backlog details not found for backlog_id: ${documentDetails.backlog_id}`);
      return res.status(404).json({
        success: false,
        error: 'Backlog details not found'
      });
    }

    console.log(`[View Document] Found backlog with case_type: ${backlogDetails.case_types.case_type_name}`);

    // Step 4: Build bucket name
    const bucketName = buildBucketName(backlogDetails.case_types.case_type_name);
    console.log(`[View Document] Using bucket: ${bucketName}`);
    console.log(`[View Document] Original file_path: ${documentDetails.file_path}`);

    // Step 5: Extract and normalize storage path
    let storagePath = documentDetails.file_path;
    
    // If it's a full URL (Supabase storage URL), extract just the path
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
    } else if (storagePath && storagePath.includes('/')) {
      // If path starts with bucket name pattern, try to remove it
      const pathParts = storagePath.split('/');
      if (pathParts[0].startsWith('expc-') || pathParts[0].startsWith('public-')) {
        storagePath = pathParts.slice(1).join('/');
      }
    }

    console.log(`[View Document] Normalized storage path: ${storagePath}`);

    // Step 6: Try to download from S3 first, then fallback to Supabase storage
    let downloadResult;
    
    // Try S3 download
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: storagePath
      });
      const response = await s3Client.send(command);
      
      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      downloadResult = {
        success: true,
        buffer,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        source: 'S3'
      };
      console.log(`[View Document] ✓ File found in S3 bucket: ${bucketName}`);
    } catch (s3Error) {
      console.log(`[View Document] ✗ S3 download failed: ${s3Error.message}, trying Supabase storage...`);
      
      // Fallback to Supabase storage - Note: This requires Supabase JS client
      // For now, return error if S3 fails
      downloadResult = {
        success: false,
        error: `File not found in S3. S3 error: ${s3Error.message}`,
        storage_path: storagePath,
        bucket_name: bucketName
      };
    }

    if (!downloadResult.success) {
      return res.status(404).json({
        success: false,
        error: `Failed to download file: ${downloadResult.error}`,
        details: {
          bucket_name: bucketName,
          storage_path: downloadResult.storage_path,
          case_type_name: backlogDetails.case_types.case_type_name
        }
      });
    }

    // Step 7: Return file as binary response (for viewing in browser)
    const filename = storagePath.split('/').pop() || documentDetails.file_path.split('/').pop();
    
    // Determine Content-Type based on file extension (fallback if S3 doesn't provide it)
    const contentTypeMap = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    const ext = path.extname(filename).toLowerCase();
    const contentType = downloadResult.contentType || contentTypeMap[ext] || 'application/octet-stream';

    console.log(`[View Document] Returning file: ${downloadResult.buffer.length} bytes, type: ${contentType}, filename: ${filename}`);

    // Validate buffer is not empty
    if (!downloadResult.buffer || downloadResult.buffer.length === 0) {
      console.error('[View Document] Error: Buffer is empty');
      return res.status(500).json({
        success: false,
        error: 'File buffer is empty'
      });
    }

    res.set({
      'Content-Type': contentType,
      'Content-Length': downloadResult.contentLength || downloadResult.buffer.length,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    
    return res.status(200).send(downloadResult.buffer);
  } catch (error) {
    console.error('Partner document view error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Partner document view service is running' });
});

app.listen(PORT, () => {
  console.log(`Partner document view service running on port ${PORT}`);
});

module.exports = app;


// partnerDocumentView.js - View/download partner backlog documents from S3

const express = require('express');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

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
      contentLength: response.ContentLength
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

    // Step 2: Get backlog document details
    const documentDetails = await getBacklogDocumentDetails(document_id);
    
    if (!documentDetails) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    // Step 3: Get backlog details with case type
    const backlogDetails = await getBacklogDetailsWithType(documentDetails.backlog_id);
    if (!backlogDetails || !backlogDetails.case_types) {
      return res.status(404).json({
        success: false,
        error: 'Backlog details not found'
      });
    }

    // Step 4: Build bucket name
    const bucketName = buildBucketName(backlogDetails.case_types.case_type_name);

    // Step 5: Download file from S3
    const downloadResult = await downloadFromS3(
      bucketName,
      documentDetails.file_path
    );

    if (!downloadResult.success) {
      return res.status(500).json({
        success: false,
        error: `Failed to download file: ${downloadResult.error}`
      });
    }

    // Step 6: Return file as binary response
    const filename = documentDetails.file_path.split('/').pop();
    
    res.set({
      'Content-Type': downloadResult.contentType || 'application/octet-stream',
      'Content-Length': downloadResult.contentLength,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-cache'
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


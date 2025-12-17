import multer from 'multer';

// Use memory storage instead of disk storage
// Files will be uploaded directly to Supabase Storage, not saved locally
const storage = multer.memoryStorage();

// File filter (optional - allow all files for now)
const fileFilter = (req, file, cb) => {
  cb(null, true);
};

// Create multer instance with memory storage
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit (increased for document uploads)
  }
});

// Middleware for handling multiple files with dynamic field names
export const uploadMultipleFiles = (req, res, next) => {
  // Use .any() to accept any field name
  upload.any()(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        message: 'File upload error: ' + err.message,
        statusCode: 400
      });
    }
    next();
  });
};

// Middleware for handling single file upload (field name: "document")
export const uploadSingleFile = (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        message: 'File upload error: ' + err.message,
        statusCode: 400
      });
    }
    next();
  });
};

// Middleware for handling single file upload (field name: "data")
export const uploadDataFile = (req, res, next) => {
  upload.single('data')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        message: 'File upload error: ' + err.message,
        statusCode: 400
      });
    }
    next();
  });
};

export default upload;


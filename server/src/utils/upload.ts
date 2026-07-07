import multer from 'multer';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Multer instance configured for in-memory CSV uploads.
 * The file is never written to disk — we parse it from the Buffer directly.
 */
export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    const isCSV =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/csv' ||
      file.originalname.toLowerCase().endsWith('.csv');

    if (isCSV) {
      cb(null, true);
    } else {
      cb(new Error(`Only CSV files are accepted. Received: ${file.mimetype}`));
    }
  },
});

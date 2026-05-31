const multer = require('multer');

const DEFAULT_MAX_MB = 25;
const maxMb = Number(process.env.MAX_UPLOAD_FILE_MB);
const maxFileBytes =
  (maxMb > 0 ? maxMb : DEFAULT_MAX_MB) * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileBytes },
  fileFilter(req, file, cb) {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      name.endsWith('.csv') ||
      name.endsWith('.tsv') ||
      name.endsWith('.txt') ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls');
    if (!ok) {
      cb(new Error('Only .csv, .tsv, .txt, .xlsx, or .xls files are allowed'));
      return;
    }
    cb(null, true);
  },
});

module.exports = { upload, maxFileBytes, maxMb: maxMb > 0 ? maxMb : DEFAULT_MAX_MB };

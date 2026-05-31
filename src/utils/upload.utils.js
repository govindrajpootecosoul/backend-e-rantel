/** Release multer memory buffer after parsing — file is never written to disk. */
const releaseUploadFile = (req) => {
  if (req.file?.buffer) {
    req.file.buffer = null;
  }
};

module.exports = { releaseUploadFile };

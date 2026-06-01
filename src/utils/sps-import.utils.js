const { recordsFromBuffer } = require('./spreadsheet-parse.utils');
const { rowFromRecord, enrichRow, hasMinimumData } = require('./sps-columns');

const MAX_IMPORT_ROWS = Number(process.env.MAX_UPLOAD_ROWS) || 50_000;

exports.parseUploadBuffer = (buffer, originalName = '', storeId = 'sps') => {
  const records = recordsFromBuffer(buffer, originalName);

  if (records.length > MAX_IMPORT_ROWS) {
    const err = new Error(`File has ${records.length} rows. Maximum allowed is ${MAX_IMPORT_ROWS}.`);
    err.statusCode = 400;
    throw err;
  }

  const docs = [];
  const skipped = [];

  records.forEach((record, index) => {
    const parsed = rowFromRecord(record);
    const doc = enrichRow(parsed, storeId);
    if (!hasMinimumData(doc)) {
      skipped.push(index + 2);
      return;
    }
    docs.push(doc);
  });

  return { docs, skipped, totalRead: records.length };
};

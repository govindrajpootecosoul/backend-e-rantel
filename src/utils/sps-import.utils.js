const { recordsFromBuffer } = require('./spreadsheet-parse.utils');
const {
  rowFromRecord,
  enrichRow,
  isImportablePoSkuRow,
  isBlankSpreadsheetRecord,
} = require('./sps-columns');

const MAX_IMPORT_ROWS = Number(process.env.MAX_UPLOAD_ROWS) || 150_000;

exports.parseUploadBuffer = (buffer, originalName = '', storeId = 'sps') => {
  const { records, sheetName, sheetCount } = recordsFromBuffer(buffer, originalName);

  if (records.length > MAX_IMPORT_ROWS) {
    const err = new Error(`File has ${records.length} rows. Maximum allowed is ${MAX_IMPORT_ROWS}.`);
    err.statusCode = 400;
    throw err;
  }

  const skipped = [];
  const skippedBlank = [];
  const skippedIncomplete = [];
  const dedupeMap = new Map();

  records.forEach((record, index) => {
    const excelRow = index + 2;

    if (isBlankSpreadsheetRecord(record)) {
      skippedBlank.push(excelRow);
      return;
    }

    const parsed = rowFromRecord(record);
    const doc = enrichRow(parsed, storeId);

    if (!isImportablePoSkuRow(doc)) {
      skippedIncomplete.push(excelRow);
      return;
    }

    const key = `${doc.storeId || ''}|${doc.poNumber || ''}|${doc.sku || ''}`;
    dedupeMap.set(key, doc);
  });

  const docs = Array.from(dedupeMap.values());
  const parsedRowCount = records.length - skippedBlank.length;
  const duplicateRowsMerged = parsedRowCount - skippedIncomplete.length - docs.length;

  return {
    docs,
    skipped: skippedIncomplete,
    skippedBlank: skippedBlank.length,
    skippedIncomplete: skippedIncomplete.length,
    totalRead: records.length,
    parsedRowCount,
    sheetName,
    sheetCount,
    duplicateRowsMerged,
  };
};

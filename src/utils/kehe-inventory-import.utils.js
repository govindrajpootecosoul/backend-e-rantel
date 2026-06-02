const { rowFromRecord, hasMinimumData } = require('./kehe-inventory-columns');
const { recordsFromBuffer } = require('./spreadsheet-parse.utils');

exports.parseInventoryUploadBuffer = (buffer, originalName = '') => {
  const { records } = recordsFromBuffer(buffer, originalName);

  const docs = [];
  const skipped = [];

  records.forEach((record, index) => {
    const doc = rowFromRecord(record);
    if (!hasMinimumData(doc)) {
      skipped.push(index + 2);
      return;
    }
    docs.push(doc);
  });

  return { docs, skipped, totalRead: records.length };
};

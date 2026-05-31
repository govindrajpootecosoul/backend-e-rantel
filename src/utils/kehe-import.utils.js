const { rowFromRecord, hasMinimumData } = require('./kehe-columns');
const { recordsFromBuffer } = require('./spreadsheet-parse.utils');

exports.parseUploadBuffer = (buffer, originalName = '') => {
  const records = recordsFromBuffer(buffer, originalName);

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

exports.parseGenericUploadBuffer = (buffer, originalName = '') => {
  const records = recordsFromBuffer(buffer, originalName);

  const docs = records
    .map((record) => rowFromRecord(record))
    .filter((doc) => hasMinimumData(doc));

  return { docs, totalRead: records.length };
};

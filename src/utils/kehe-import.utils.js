const XLSX = require('xlsx');
const { rowFromRecord, hasMinimumData } = require('./kehe-columns');

const TEXT_EXTENSIONS = ['.csv', '.tsv', '.txt'];

const isTextUpload = (originalName = '') => {
  const lower = originalName.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

const parseDelimitedText = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(delimiter).map((p) => p.trim().replace(/^"|"$/g, ''));
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = parts[idx] ?? '';
    });
    rows.push(record);
  }
  return rows;
};

const sheetToRecords = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
};

const recordsFromBuffer = (buffer, originalName = '') => {
  if (isTextUpload(originalName)) {
    return parseDelimitedText(buffer.toString('utf8'));
  }
  return sheetToRecords(buffer);
};

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
    .map((record) => {
      const doc = rowFromRecord(record);
      const raw = { ...record };
      return { ...doc, raw };
    })
    .filter((doc) => hasMinimumData(doc) || doc.raw);

  return { docs, totalRead: records.length };
};

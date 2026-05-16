const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', '..', '..', 'api') });
const connect = require('../../../../config/connect');

function summarizeText(text) {
  const value = typeof text === 'string' ? text : '';

  return {
    present: value.length > 0,
    length: value.length,
    preview: value.slice(0, 1000),
  };
}

function summarizeFile(file) {
  return {
    id: file._id?.toString() ?? '',
    file_id: file.file_id ?? '',
    filename: file.filename ?? '',
    type: file.type ?? '',
    source: file.source ?? '',
    context: file.context ?? '',
    model: file.model ?? '',
    bytes: file.bytes ?? 0,
    filepath: file.filepath ?? '',
    embedded: file.embedded ?? null,
    usage: file.usage ?? null,
    createdAt: file.createdAt?.toISOString?.() ?? null,
    updatedAt: file.updatedAt?.toISOString?.() ?? null,
    text: summarizeText(file.text),
  };
}

async function run() {
  await connect();

  try {
    const { File } = createModels(mongoose);
    const filename = process.argv[3] || 'POC.pdf';
    const files = await File.find({ filename })
      .sort({ createdAt: -1, _id: -1 })
      .limit(10)
      .lean();

    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          filename,
          count: files.length,
          files: files.map(summarizeFile),
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { run };

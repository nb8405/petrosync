const fs = require("fs");
const zlib = require("zlib");

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date = new Date()) => {
  const year = Math.max(date.getFullYear(), 1980);
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const day =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return { time, day };
};

const writeUInt16 = (value) => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
};

const writeUInt32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
};

const createZipBuffer = (files) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBuffer = Buffer.from(file.name.replace(/\\/g, "/"), "utf8");
    const source = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(String(file.content || ""), "utf8");
    const compressed = zlib.deflateRawSync(source, { level: 9 });
    const checksum = crc32(source);
    const { time, day } = dosDateTime(file.date || new Date());

    const localHeader = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(8),
      writeUInt16(time),
      writeUInt16(day),
      writeUInt32(checksum),
      writeUInt32(compressed.length),
      writeUInt32(source.length),
      writeUInt16(nameBuffer.length),
      writeUInt16(0),
      nameBuffer,
    ]);

    localParts.push(localHeader, compressed);

    const centralHeader = Buffer.concat([
      writeUInt32(0x02014b50),
      writeUInt16(20),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(8),
      writeUInt16(time),
      writeUInt16(day),
      writeUInt32(checksum),
      writeUInt32(compressed.length),
      writeUInt32(source.length),
      writeUInt16(nameBuffer.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(offset),
      nameBuffer,
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length + compressed.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(files.length),
    writeUInt16(files.length),
    writeUInt32(centralDirectory.length),
    writeUInt32(offset),
    writeUInt16(0),
  ]);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
};

const readZipEntries = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const entries = {};
  let offset = 0;

  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const flags = buffer.readUInt16LE(offset + 6);

    if (flags & 0x0008) {
      throw new Error("Unsupported ZIP data descriptor.");
    }

    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const compressed = buffer.subarray(dataStart, dataEnd);
    const content =
      method === 8
        ? zlib.inflateRawSync(compressed)
        : method === 0
        ? compressed
        : null;

    if (!content) {
      throw new Error("Unsupported ZIP compression method.");
    }

    if (content.length !== uncompressedSize) {
      throw new Error("ZIP entry size mismatch.");
    }

    entries[name] = content;
    offset = dataEnd;
  }

  return entries;
};

module.exports = {
  createZipBuffer,
  readZipEntries,
  crc32,
};

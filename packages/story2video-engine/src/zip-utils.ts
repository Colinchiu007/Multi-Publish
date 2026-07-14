/**
 * 轻量 ZIP 打包工具（纯 JS，无外部依赖）
 *
 * 使用 STORE 模式（无压缩，但结构合规），适合作业导出场景。
 * 如需更好的压缩率，接入 JSZip（`npm install jszip`）。
 */

/** 将多个 Blob 打包成 ZIP 文件 */
export async function createZip(
  files: Array<{ name: string; data: Blob }>,
): Promise<Blob> {
  const localHeaders: ArrayBuffer[] = [];
  const fileData: ArrayBuffer[] = [];
  const centralEntries: ArrayBuffer[] = [];
  let offset = 0;

  for (const file of files) {
    const data = await file.data.arrayBuffer();
    const crc = crc32(new Uint8Array(data));
    const nameBytes = new TextEncoder().encode(file.name);
    const compressedSize = data.byteLength;
    const uncompressedSize = data.byteLength;

    // Local file header (30 bytes + filename)
    const header = new ArrayBuffer(30 + nameBytes.length);
    const view = new DataView(header);
    // Signature
    view.setUint32(0, 0x04034b50, true);
    // Version needed
    view.setUint16(4, 20, true);
    // General purpose bit flag
    view.setUint16(6, 0, true);
    // Compression method (0 = STORE)
    view.setUint16(8, 0, true);
    // Last mod file time
    view.setUint16(10, 0, true);
    // Last mod file date
    view.setUint16(12, 0, true);
    // CRC-32
    view.setUint32(14, crc, true);
    // Compressed size
    view.setUint32(18, compressedSize, true);
    // Uncompressed size
    view.setUint32(22, uncompressedSize, true);
    // Filename length
    view.setUint16(26, nameBytes.length, true);
    // Extra field length
    view.setUint16(28, 0, true);
    // Filename
    new Uint8Array(header).set(nameBytes, 30);

    localHeaders.push(header);
    fileData.push(data);

    // Central directory entry (46 bytes + filename)
    const central = new ArrayBuffer(46 + nameBytes.length);
    const cview = new DataView(central);
    cview.setUint32(0, 0x02014b50, true);
    cview.setUint16(4, 20, true);
    cview.setUint16(6, 20, true);
    cview.setUint16(8, 0, true);
    cview.setUint16(10, 0, true);
    cview.setUint16(12, 0, true);
    cview.setUint32(14, crc, true);
    cview.setUint32(18, compressedSize, true);
    cview.setUint32(22, uncompressedSize, true);
    cview.setUint16(26, nameBytes.length, true);
    cview.setUint16(28, 0, true);
    cview.setUint16(30, 0, true); // comment length
    cview.setUint16(32, 0, true); // disk number start
    cview.setUint16(34, 0, true); // internal file attributes
    cview.setUint32(36, 0, true); // external file attributes
    cview.setUint32(40, offset, true); // relative offset
    new Uint8Array(central).set(nameBytes, 46);

    centralEntries.push(central);
    offset += header.byteLength + data.byteLength;
  }

  // Build final blob
  const centralSize = centralEntries.reduce((s, b) => s + b.byteLength, 0);
  const centralOffset = offset;

  // End of central directory (22 bytes)
  const eocd = new ArrayBuffer(22);
  const eview = new DataView(eocd);
  eview.setUint32(0, 0x06054b50, true);
  eview.setUint16(4, 0, true); // disk number
  eview.setUint16(6, 0, true); // disk with central dir
  eview.setUint16(8, files.length, true); // entries on disk
  eview.setUint16(10, files.length, true); // total entries
  eview.setUint32(12, centralSize, true); // central dir size
  eview.setUint32(16, centralOffset, true); // central dir offset
  eview.setUint16(20, 0, true); // comment length

  const parts = [
    ...localHeaders,
    ...fileData,
    ...centralEntries,
    eocd,
  ];

  return new Blob(parts, { type: 'application/zip' });
}

/** 触发 ZIP 下载 */
export function downloadZip(blob: Blob, filename: string = 'export.zip'): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// CRC-32 implementation (simplified, table-driven)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

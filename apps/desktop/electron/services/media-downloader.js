// @ts-nocheck
/**
 * MediaDownloader ? ????????
 *
 * ? MediaTrace ipc.ts ??????????
 * - Readable.fromWeb() + Transform ? + pipeline()
 * - ??????
 * - Content-Type ? ?????
 * - Content-Disposition ?????
 * - ???????
 * - AbortSignal ??
 *
 * ????: apps/desktop/electron/services/media-downloader.js
 */

const fs = require("fs");
const path = require("path");
const { pipeline: streamPipeline } = require("stream");
const { promisify } = require("util");
const log = require("./logger");

const pipelineAsync = promisify(streamPipeline);

// ??? Content-Type ? ????? ??????????????????????????

const CONTENT_TYPE_MAP = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/x-msvideo": ".avi",
  "video/quicktime": ".mov",
  "video/x-matroska": ".mkv",
  "video/ogg": ".ogv",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".weba",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
};

/**
 * ?? Content-Type ???????
 * @param {string} contentType - HTTP Content-Type ?
 * @returns {string} ??????????????? .bin
 */
function getExtensionFromContentType(contentType) {
  if (!contentType || typeof contentType !== "string") return ".bin";
  const key = contentType.split(";")[0].trim().toLowerCase();
  return CONTENT_TYPE_MAP[key] || ".bin";
}

// ??? Content-Disposition ?? ???????????????????????????

/**
 * ? Content-Disposition ???????
 * ??????? RFC 5987 (filename*)
 * @param {string} disposition - Content-Disposition ??
 * @returns {string|null} ????????? null
 */
function getFileNameFromDisposition(disposition) {
  if (!disposition || typeof disposition !== "string") return null;

  // RFC 5987: filename*=UTF-8''%E6%96%87%E4%BB%B6.mp4
  const rfc5987Match = disposition.match(/filename\*\s*=\s*(?:UTF-8|ISO-8859-1)''([^;\s]+)/i);
  if (rfc5987Match) {
    try {
      return decodeURIComponent(rfc5987Match[1]);
    } catch {
      // fall through to filename=
    }
  }

  // Standard: filename="value" or filename=value
  const stdMatch = disposition.match(/filename\s*=\s*"([^"]*)"(?:\s*;|$)/i) ||
                   disposition.match(/filename\s*=\s*([^;\s]+)/i);
  if (stdMatch) {
    return stdMatch[1];
  }

  return null;
}

// ??? ??????? ?????????????????????????????????????

/**
 * ???????????????????? (1), (2)... ??
 * @param {string} filePath - ??????
 * @returns {string} ??????
 */
function ensureUniqueFilePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  let counter = 1;
  let newPath;
  do {
    newPath = path.join(dir, `${base} (${counter})${ext}`);
    counter++;
  } while (fs.existsSync(newPath));

  return newPath;
}

// ??? ????? ?????????????????????????????????????????

/**
 * ????????
 *
 * @param {string} url - ?? URL
 * @param {string} destDir - ??????????
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - ????
 * @param {function} [options.onProgress] - ???? (received, total)
 * @param {string} [options.filename] - ??????????????
 * @param {object} [options.headers] - ??????
 * @param {string} [options.defaultExt] - ??????????????
 * @returns {Promise<{filePath: string, size: number, contentType: string}>}
 */
async function downloadMedia(url, destDir, options = {}) {
  const { signal, onProgress, filename, headers, defaultExt } = options;

  // ????
  if (!fs.existsSync(destDir)) {
    throw new Error(`Destination directory does not exist: ${destDir}`);
  }

  // ??????
  if (signal && signal.aborted) {
    throw new Error("Download aborted");
  }

  const axios = require("axios");

  const resp = await axios.get(url, {
    responseType: "stream",
    headers: headers || {},
    signal,
  });

  const contentType = resp.headers["content-type"] || "";
  const contentDisposition = resp.headers["content-disposition"] || "";
  const totalSize = parseInt(resp.headers["content-length"] || "0", 10) || 0;

  // ?????
  let finalFilename = filename;
  if (!finalFilename) {
    finalFilename = getFileNameFromDisposition(contentDisposition);
  }
  if (!finalFilename) {
    // ? URL ?????
    const urlPath = new URL(url).pathname;
    const urlBase = path.basename(urlPath);
    if (urlBase && urlBase.includes(".")) {
      finalFilename = urlBase;
    } else {
      const ext = getExtensionFromContentType(contentType);
      finalFilename = `download${ext === ".bin" && defaultExt ? defaultExt : ext}`;
    }
  }

  const filePath = ensureUniqueFilePath(path.join(destDir, finalFilename));
  let receivedBytes = 0;

  // ?????
  const { Transform } = require("stream");
  const progressTransform = new Transform({
    transform(chunk, encoding, callback) {
      receivedBytes += chunk.length;
      if (onProgress && totalSize > 0) {
        onProgress(receivedBytes, totalSize);
      }
      callback(null, chunk);
    },
  });

  const writer = fs.createWriteStream(filePath);

  try {
    if (signal) {
      // ??????
      const cleanup = () => {
        resp.data.destroy();
        writer.destroy();
        // ?????????
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch { /* ignore */ }
      };
      signal.addEventListener("abort", cleanup, { once: true });
    }

    await pipelineAsync(resp.data, progressTransform, writer);

    // ???? 100%
    if (onProgress && totalSize > 0) {
      onProgress(totalSize, totalSize);
    }

    const stats = fs.statSync(filePath);
    log.info("MediaDownloader", `Downloaded: ${finalFilename} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);

    return {
      filePath,
      size: stats.size,
      contentType,
    };
  } catch (err) {
    // ?????????
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* ignore */ }
    throw err;
  }
}

module.exports = {
  getExtensionFromContentType,
  getFileNameFromDisposition,
  ensureUniqueFilePath,
  downloadMedia,
};


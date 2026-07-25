/**
 * Upload Middleware Utility for CS-Framework
 * Minimal multipart/form-data parser using Node.js streams
 * 
 * Usage:
 *   const { parseUpload } = require('./utils/file-upload');
 *   const files = await parseUpload(req, 'uploads/knowledge', {
 *     maxFileSize: 10 * 1024 * 1024,  // 10MB
 *     allowedTypes: ['application/pdf', 'image/png']
 *   });
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Parse multipart form data and save files
 * @param {Request} req - Express request
 * @param {string} uploadDir - Directory to save files
 * @param {object} options - { maxFileSize, allowedTypes }
 * @returns {Promise<Array>} Array of file metadata objects
 */
async function parseUpload(req, uploadDir, options = {}) {
  const {
    maxFileSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = [] // empty = all types allowed
  } = options;

  const resolvedDir = path.resolve(uploadDir);
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)/i);
  if (!boundaryMatch) {
    throw new Error('No multipart boundary found in Content-Type');
  }
  const boundary = boundaryMatch[1].trim();

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const files = parseMultipartBuffer(buffer, boundary, resolvedDir, maxFileSize, allowedTypes);
        resolve(files);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Parse a multipart buffer into file metadata
 */
function parseMultipartBuffer(buffer, boundary, uploadDir, maxFileSize, allowedTypes) {
  const files = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

  let start = 0;
  const data = buffer.toString('latin1');

  while (start < buffer.length) {
    // Find next boundary
    const boundaryIdx = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIdx === -1) break;

    // Find end of headers (double CRLF)
    const headerStart = boundaryIdx + boundaryBuffer.length;
    const headerEnd = buffer.indexOf('\r\n\r\n', headerStart);
    if (headerEnd === -1) break;

    // Extract headers
    const headerSection = buffer.slice(headerStart, headerEnd).toString('utf8');
    const filenameMatch = headerSection.match(/filename="([^"]+)"/i);
    if (!filenameMatch) {
      // Non-file field, skip
      const nextBoundary = buffer.indexOf(boundaryBuffer, headerEnd + 4);
      start = nextBoundary === -1 ? buffer.length : nextBoundary;
      continue;
    }

    const contentTypeMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/i);
    const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
    const originalName = filenameMatch[1];

    // Check allowed types
    if (allowedTypes.length > 0 && !allowedTypes.includes(mimeType)) {
      throw new Error(`File type not allowed: ${mimeType} (file: ${originalName})`);
    }

    // Extract file content (between header end and next boundary)
    const contentStart = headerEnd + 4;
    const nextBoundaryIdx = buffer.indexOf(`\r\n${boundaryBuffer.toString('latin1')}`, contentStart);
    if (nextBoundaryIdx === -1) break;

    // Remove trailing \r\n from content
    const contentEnd = nextBoundaryIdx;
    const fileContent = buffer.slice(contentStart, contentEnd);

    // Check file size
    if (fileContent.length > maxFileSize) {
      throw new Error(`File too large: ${originalName} (${fileContent.length} bytes, max: ${maxFileSize})`);
    }

    // Generate unique filename
    const id = uuidv4();
    const ext = path.extname(originalName);
    const filename = `${id}${ext}`;
    const filePath = path.join(uploadDir, filename);

    // Write file
    fs.writeFileSync(filePath, fileContent);

    files.push({
      id,
      originalName,
      mimeType,
      size: fileContent.length,
      uploadedAt: new Date().toISOString(),
      filename,
      path: filePath
    });

    start = nextBoundaryIdx + 2; // Skip \r\n before next boundary
  }

  return files;
}

module.exports = { parseUpload };
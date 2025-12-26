const Busboy = require("busboy");
const { pdfToImageCloud } = require("./vision-utils");

module.exports = async (req, res) => {
  // Set CORS headers first
  const origin = req.headers.origin || req.headers.Origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('🔄 PDF to image conversion endpoint called');

  try {
    // Parse multipart form data
    const { file } = await new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });
      let file = null;
      let finished = false;

      const timeout = setTimeout(() => {
        if (!finished) {
          finished = true;
          reject(new Error('Form parsing timeout'));
        }
      }, 30000);

      busboy.on('file', (name, stream, info) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          file = {
            fieldname: name,
            originalname: info.filename,
            mimetype: info.mimeType,
            buffer: Buffer.concat(chunks),
            size: Buffer.concat(chunks).length
          };
        });
      });

      busboy.on('finish', () => {
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          resolve({ file });
        }
      });

      busboy.on('error', (err) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      req.pipe(busboy);
    });

    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }

    // Check if it's a PDF
    const isPDF = file.mimetype.includes("pdf") || file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPDF) {
      return res.status(400).json({ error: "File must be a PDF" });
    }

    console.log('✅ PDF received:', file.originalname, file.size, 'bytes');

    // Check file size
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "File too large (max 10MB)" });
    }

    // Convert PDF to image
    console.log('📸 Converting PDF to image...');
    const imageBuffer = await pdfToImageCloud(file.buffer);
    console.log('✅ PDF converted to image, size:', imageBuffer.length, 'bytes');

    // Return the image as base64
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    return res.status(200).json({
      success: true,
      imageData: dataUrl,
      imageSize: imageBuffer.length,
      originalFileName: file.originalname.replace(/\.pdf$/i, '.png')
    });

  } catch (error) {
    const errorMsg = error?.message || String(error || 'Unknown error');
    console.error('❌ PDF conversion error:', errorMsg);
    return res.status(500).json({
      success: false,
      error: errorMsg
    });
  }
};


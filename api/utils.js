const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");

async function extractTextFromFile(file) {
  const isPDF = file.mimetype.includes("pdf") || file.originalname.toLowerCase().endsWith(".pdf");
  const isImage = file.mimetype.startsWith("image/") || 
                  file.originalname.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i);

  let text = "";

  if (isPDF) {
    try {
      const pdfData = await pdfParse(file.buffer);
      text = pdfData?.text || "";
    } catch (parseError) {
      console.error("PDF parse error:", parseError);
      throw new Error("Could not parse PDF file.");
    }
  } else if (isImage) {
    try {
      console.log('🖼️ Starting image OCR processing...');
      // Aggressively optimize image for fast OCR
      let processedImage = file.buffer;
      
      // Get image metadata
      const metadata = await sharp(file.buffer).metadata();
      console.log('📐 Original dimensions:', metadata.width, 'x', metadata.height);
      
      // Aggressively resize to max 1000px for much faster OCR
      const maxDimension = 1000;
      let targetWidth = metadata.width;
      let targetHeight = metadata.height;
      
      if (metadata.width > maxDimension || metadata.height > maxDimension) {
        const ratio = Math.min(maxDimension / metadata.width, maxDimension / metadata.height);
        targetWidth = Math.round(metadata.width * ratio);
        targetHeight = Math.round(metadata.height * ratio);
        console.log('🔄 Resizing to:', targetWidth, 'x', targetHeight, 'for faster OCR');
      }
      
      // Process image with aggressive optimization
      processedImage = await sharp(file.buffer)
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .greyscale() // Convert to greyscale
        .normalize() // Normalize contrast
        .sharpen({ sigma: 1 }) // Light sharpen
        .toBuffer();
      
      console.log('🔤 Starting OCR recognition with fast settings...');
      
      // Use fastest OCR settings possible
      const ocrPromise = Tesseract.recognize(processedImage, 'eng', {
        logger: () => {}, // Disable logging for speed
        // Fastest settings
        tessedit_pageseg_mode: '6', // Assume uniform block of text (fastest)
        tessedit_ocr_engine_mode: '1', // LSTM only (faster than legacy)
        // Remove whitelist to speed up (less processing)
      });
      
      // Shorter timeout - 15 seconds max
      const ocrTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OCR processing timeout - image may be too complex')), 15000)
      );
      
      const result = await Promise.race([ocrPromise, ocrTimeout]);
      text = result.data?.text || "";
      
      if (!text || text.trim().length === 0) {
        console.warn('⚠️ OCR returned no text, trying with different settings...');
        // Fallback: try with different page segmentation
        const fallbackResult = await Promise.race([
          Tesseract.recognize(processedImage, 'eng', {
            tessedit_pageseg_mode: '1', // Auto with OSD
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Fallback OCR timeout')), 10000))
        ]);
        text = fallbackResult.data?.text || "";
      }
      
      console.log('✅ OCR completed, extracted', text.length, 'characters');
    } catch (ocrError) {
      console.error("❌ OCR error:", ocrError);
      throw new Error("Could not extract text from image: " + (ocrError.message || "Unknown error"));
    }
  } else {
    throw new Error("File must be a PDF or image (PNG, JPG, etc.). Received: " + file.mimetype);
  }

  if (!text || text.trim().length === 0) {
    throw new Error("Could not read any text from the document.");
  }

  return text;
}

module.exports = { extractTextFromFile };

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
      console.log('📄 Processing PDF...');
      const pdfData = await pdfParse(file.buffer);
      text = pdfData?.text || "";
      console.log('✅ PDF processed, text length:', text.length);
    } catch (parseError) {
      console.error("❌ PDF parse error:", parseError);
      throw new Error("Could not parse PDF file.");
    }
  } else if (isImage) {
    try {
      console.log('🖼️ Processing image for OCR...');
      
      // Get image metadata
      const metadata = await sharp(file.buffer).metadata();
      console.log('📐 Original size:', metadata.width, 'x', metadata.height);
      
      // Resize to max 1000px for speed
      const maxDimension = 1000;
      let targetWidth = metadata.width;
      let targetHeight = metadata.height;
      
      if (metadata.width > maxDimension || metadata.height > maxDimension) {
        const ratio = Math.min(maxDimension / metadata.width, maxDimension / metadata.height);
        targetWidth = Math.round(metadata.width * ratio);
        targetHeight = Math.round(metadata.height * ratio);
        console.log('🔄 Resizing to:', targetWidth, 'x', targetHeight);
      }
      
      // Process image
      const processedImage = await sharp(file.buffer)
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .greyscale()
        .normalize()
        .sharpen({ sigma: 1 })
        .toBuffer();
      
      console.log('🔤 Running OCR...');
      
      // OCR with timeout
      const ocrPromise = Tesseract.recognize(processedImage, 'eng', {
        logger: () => {}, // Disable logging for speed
        tessedit_pageseg_mode: '6', // Uniform block (fastest)
        tessedit_ocr_engine_mode: '1' // LSTM only
      });
      
      const ocrTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OCR timeout')), 12000)
      );
      
      const result = await Promise.race([ocrPromise, ocrTimeout]);
      text = result.data?.text || "";
      
      if (!text || text.trim().length === 0) {
        // Try fallback with different settings
        console.log('⚠️ No text found, trying fallback...');
        const fallbackResult = await Promise.race([
          Tesseract.recognize(processedImage, 'eng', {
            tessedit_pageseg_mode: '1' // Auto with OSD
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Fallback timeout')), 8000))
        ]);
        text = fallbackResult.data?.text || "";
      }
      
      console.log('✅ OCR complete, text length:', text.length);
    } catch (ocrError) {
      console.error("❌ OCR error:", ocrError);
      throw new Error("Could not extract text from image: " + (ocrError.message || "Unknown error"));
    }
  } else {
    throw new Error("File must be a PDF or image. Received: " + file.mimetype);
  }

  if (!text || text.trim().length === 0) {
    throw new Error("Could not read any text from the document.");
  }

  return text;
}

module.exports = { extractTextFromFile };

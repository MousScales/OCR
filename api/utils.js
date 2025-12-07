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
      // Optimize image processing - resize if too large, optimize for OCR
      let processedImage = file.buffer;
      
      // Get image metadata
      const metadata = await sharp(file.buffer).metadata();
      console.log('📐 Image dimensions:', metadata.width, 'x', metadata.height);
      
      // If image is very large, resize it to speed up OCR (max 1500px on longest side for faster processing)
      if (metadata.width > 1500 || metadata.height > 1500) {
        const maxDimension = 1500;
        const ratio = Math.min(maxDimension / metadata.width, maxDimension / metadata.height);
        console.log('🔄 Resizing image for faster OCR:', Math.round(metadata.width * ratio), 'x', Math.round(metadata.height * ratio));
        
        processedImage = await sharp(file.buffer)
          .resize(Math.round(metadata.width * ratio), Math.round(metadata.height * ratio), {
            fit: 'inside',
            withoutEnlargement: true
          })
          .greyscale()
          .normalize()
          .sharpen()
          .toBuffer();
      } else {
        // Process smaller images normally
        console.log('✨ Processing image at original size');
        processedImage = await sharp(file.buffer)
          .greyscale()
          .normalize()
          .sharpen()
          .toBuffer();
      }
      
      console.log('🔤 Starting OCR recognition...');
      // Use faster OCR settings with timeout
      const ocrPromise = Tesseract.recognize(processedImage, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            const progress = Math.round(m.progress * 100);
            console.log(`📊 OCR progress: ${progress}%`);
          }
        },
        // Optimize for speed
        tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?()[]{}\'"-@#$%&*+/=<>|\\_~`',
      });
      
      // Add timeout for OCR (25 seconds max)
      const ocrTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OCR processing timeout')), 25000)
      );
      
      const result = await Promise.race([ocrPromise, ocrTimeout]);
      text = result.data?.text || "";
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

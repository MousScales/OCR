const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");

async function extractTextFromFile(file) {
  const isPDF = file.mimetype.includes("pdf") || file.originalname.toLowerCase().endsWith(".pdf");
  const isImage = file.mimetype.startsWith("image/") || 
                  file.originalname.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i);

  let text = "";

  if (isPDF) {
    // PDFs should be converted to images first - don't process PDFs directly
    throw new Error("PDF files must be converted to images first. Please use the 'Convert to Image' button to convert the PDF, then click 'Start Process'.");
  } else if (isImage) {
    try {
      console.log('🖼️ Processing image with Vision API...');
      
      // Use Vision API for images (faster and more accurate than Tesseract)
      const { extractTextWithVision } = require('./vision-utils');
      
      // Optimize image for Vision API (already handles resizing in vision-utils)
      const imageBuffer = file.buffer;
      
      console.log('👁️ Extracting text with OpenAI Vision API...');
      
      // Use Vision API with timeout (30 seconds should be plenty)
      const visionPromise = extractTextWithVision(imageBuffer);
      const visionTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Vision API timeout')), 30000)
      );
      
      text = await Promise.race([visionPromise, visionTimeout]);
      
      console.log('✅ Vision API extraction complete, text length:', text.length);
      
      // Fallback to Tesseract if Vision API fails or returns no text
      if (!text || text.trim().length === 0) {
        console.log('⚠️ Vision API returned no text, trying Tesseract fallback...');
        try {
          const metadata = await sharp(file.buffer).metadata();
          const maxDimension = 1000;
          let targetWidth = metadata.width;
          let targetHeight = metadata.height;
          
          if (metadata.width > maxDimension || metadata.height > maxDimension) {
            const ratio = Math.min(maxDimension / metadata.width, maxDimension / metadata.height);
            targetWidth = Math.round(metadata.width * ratio);
            targetHeight = Math.round(metadata.height * ratio);
          }
          
          const processedImage = await sharp(file.buffer)
            .resize(targetWidth, targetHeight, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .greyscale()
            .normalize()
            .sharpen({ sigma: 1 })
            .toBuffer();
          
          const ocrPromise = Tesseract.recognize(processedImage, 'eng', {
            logger: () => {},
            tessedit_pageseg_mode: '6',
            tessedit_ocr_engine_mode: '1'
          });
          
          const ocrTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Tesseract timeout')), 15000)
          );
          
          const result = await Promise.race([ocrPromise, ocrTimeout]);
          text = result.data?.text || "";
          
          if (text && text.trim().length > 0) {
            console.log('✅ Tesseract fallback succeeded, text length:', text.length);
          }
        } catch (tesseractError) {
          console.warn('⚠️ Tesseract fallback also failed:', tesseractError.message);
          // If both fail, throw the original Vision API error context
          if (!text || text.trim().length === 0) {
            throw new Error("Could not extract text from image: Vision API and Tesseract OCR both failed");
          }
        }
      }
    } catch (visionError) {
      console.error("❌ Image text extraction error:", visionError);
      throw new Error("Could not extract text from image: " + (visionError.message || "Unknown error"));
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

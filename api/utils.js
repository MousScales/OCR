const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");

async function extractTextFromFile(file) {
  const isPDF = file.mimetype.includes("pdf") || file.originalname.toLowerCase().endsWith(".pdf");
  const isImage = file.mimetype.startsWith("image/") || 
                  file.originalname.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i);

  let text = "";

  if (isPDF) {
    // FORCE PDF to image conversion first, then fallback to text extraction if it fails
    console.log("📸 FORCING PDF to image conversion...");
    let pdfText = "";
    let visionText = "";
    let imageConversionFailed = false;
    let imageConversionError = "";
    
    // Method 1: FORCE convert to image and use Vision API (REQUIRED)
    try {
      const { pdfToImage, extractTextWithVision } = require('./vision-utils');
      console.log("📸 Converting PDF to image (REQUIRED)...");
      const imageBuffer = await pdfToImage(file.buffer);
      console.log("✅ PDF converted to image, using Vision API...");
      visionText = await extractTextWithVision(imageBuffer);
      console.log("✅ Vision API extracted text from PDF image, length:", visionText.length);
    } catch (visionError) {
      imageConversionFailed = true;
      imageConversionError = visionError.message || "PDF to image conversion failed";
      console.error("❌ PDF to image conversion FAILED:", imageConversionError);
      console.error("   Attempting fallback to PDF text extraction...");
    }
    
    // Method 2: Fallback to standard PDF text extraction if image conversion failed
    if (imageConversionFailed) {
      try {
        console.log('📄 Processing PDF with pdf-parse (fallback)...');
        const pdfData = await pdfParse(file.buffer);
        pdfText = pdfData?.text || "";
        console.log("✅ Fallback: PDF text extracted, length:", pdfText.length);
        
        // If PDF text is empty or very short, it's likely a scanned PDF
        if (!pdfText || pdfText.trim().length < 10) {
          console.warn("⚠️ PDF appears to be scanned (no extractable text). PDF to image conversion is required but not available in serverless environment.");
        }
      } catch (parseError) {
        console.error("❌ PDF text extraction also failed:", parseError.message);
        // Don't throw yet - we'll check if we have any text below
      }
    } else {
      // If image conversion succeeded, also try PDF text extraction for comprehensive analysis
      try {
        const pdfData = await pdfParse(file.buffer);
        pdfText = pdfData?.text || "";
        console.log("✅ Additional PDF text extracted, length:", pdfText.length);
      } catch (parseError) {
        console.warn("⚠️ PDF text extraction failed (non-critical):", parseError.message);
      }
    }
    
    // Combine both sources
    text = visionText || pdfText || "";
    if (visionText && pdfText) {
      // Merge both for comprehensive extraction
      text = visionText + "\n\n[Additional PDF text:]\n" + pdfText;
    }
    console.log("✅ PDF text extraction complete, total length:", text.length);
    
    // If we have no text at all, throw error with helpful message
    if (!text || text.trim().length === 0) {
      let errorMsg;
      if (imageConversionFailed) {
        if (imageConversionError.includes('Canvas') || imageConversionError.includes('serverless') || imageConversionError.includes('native')) {
          errorMsg = "PDF to image conversion is not available in this serverless environment (requires native dependencies). This PDF appears to be a scanned document with no extractable text. Please convert the PDF to an image (PNG/JPG) and upload that instead for better text extraction.";
        } else {
          errorMsg = `PDF to image conversion failed: ${imageConversionError}. PDF text extraction also failed. The PDF may be corrupted, password-protected, or a scanned document with no extractable text. Try converting the PDF to an image and uploading that instead.`;
        }
      } else {
        errorMsg = "Could not extract any text from PDF. The PDF may be corrupted, password-protected, or a scanned document. Try converting the PDF to an image (PNG/JPG) and uploading that instead.";
      }
      throw new Error(errorMsg);
    }
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

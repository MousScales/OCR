const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");

async function extractTextFromFile(file) {
  const isPDF = file.mimetype.includes("pdf") || file.originalname.toLowerCase().endsWith(".pdf");
  const isImage = file.mimetype.startsWith("image/") || 
                  file.originalname.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i);

  let text = "";

  if (isPDF) {
    // Try pdf-parse FIRST (more reliable in serverless environments)
    console.log("📄 Processing PDF with pdf-parse...");
    let pdfText = "";
    let visionText = "";
    let pdfParseFailed = false;
    let pdfParseError = "";
    
    // Method 1: Try pdf-parse first (works well for text-based PDFs)
    try {
      const pdfData = await pdfParse(file.buffer);
      pdfText = pdfData?.text || "";
      console.log("✅ PDF text extracted with pdf-parse, length:", pdfText.length);
      
      // If PDF text is empty or very short, it's likely a scanned PDF
      if (!pdfText || pdfText.trim().length < 10) {
        console.warn("⚠️ PDF appears to be scanned (no extractable text). Attempting image conversion...");
        pdfParseFailed = true;
      } else {
        // pdf-parse succeeded with good text - use it as primary source
        text = pdfText;
      }
    } catch (parseError) {
      pdfParseFailed = true;
      pdfParseError = parseError.message || "PDF text extraction failed";
      console.warn("⚠️ pdf-parse failed:", pdfParseError);
      console.log("   Attempting PDF to image conversion...");
    }
    
    // Method 2: If pdf-parse failed or returned no text, try converting to image and using Vision API
    if (pdfParseFailed || !pdfText || pdfText.trim().length < 10) {
      try {
        const { pdfToImage, extractTextWithVision } = require('./vision-utils');
        console.log("📸 Automatically converting PDF to image for Vision API...");
        const imageBuffer = await pdfToImage(file.buffer);
        console.log("✅ PDF converted to image, using Vision API...");
        visionText = await extractTextWithVision(imageBuffer);
        console.log("✅ Vision API extracted text from PDF image, length:", visionText.length);
        
        // If we got text from Vision API, use it
        if (visionText && visionText.trim().length > 0) {
          text = visionText;
        }
      } catch (visionError) {
        const visionErrorMsg = visionError.message || "PDF to image conversion failed";
        console.error("❌ PDF to image conversion FAILED:", visionErrorMsg);
        
        // If we have some text from pdf-parse, use it even if it's short
        if (pdfText && pdfText.trim().length > 0) {
          console.log("✅ Using text from pdf-parse (even though it's short)");
          text = pdfText;
        } else {
          // Both methods failed - try cloud conversion as automatic fallback
          console.log("🔄 Automatically trying cloud-based PDF conversion...");
          try {
            const { pdfToImageCloud, extractTextWithVision } = require('./vision-utils');
            const imageBuffer = await pdfToImageCloud(file.buffer);
            console.log("✅ Cloud PDF conversion successful, using Vision API...");
            visionText = await extractTextWithVision(imageBuffer);
            if (visionText && visionText.trim().length > 0) {
              console.log("✅ Vision API extracted text from cloud-converted PDF, length:", visionText.length);
              text = visionText;
            } else {
              throw new Error("No text extracted after cloud conversion");
            }
          } catch (cloudError) {
            console.error("❌ Cloud conversion also failed:", cloudError.message);
            // Final fallback: return helpful but user-friendly error
            throw new Error("Unable to process this PDF automatically. The PDF appears to be a scanned document. Please convert it to an image (PNG/JPG) and upload that instead for better results.");
          }
        }
      }
    }
    
    // Combine both sources if we have both
    if (visionText && pdfText && pdfText.trim().length >= 10) {
      // Merge both for comprehensive extraction
      text = visionText + "\n\n[Additional PDF text:]\n" + pdfText;
    } else if (visionText && !text) {
      // Use vision text if we don't have good pdf text
      text = visionText;
    } else if (!text) {
      // Fallback to pdfText if available
      text = pdfText || "";
    }
    
    console.log("✅ PDF text extraction complete, total length:", text.length);
    
    // Final check - if we still have no text, throw error
    if (!text || text.trim().length === 0) {
      throw new Error("Could not extract any text from PDF. The PDF may be corrupted, password-protected, or a scanned document. Try converting the PDF to an image (PNG/JPG) and uploading that instead.");
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

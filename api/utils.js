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
      // Optimize image processing - resize if too large, optimize for OCR
      let processedImage = file.buffer;
      
      // Get image metadata
      const metadata = await sharp(file.buffer).metadata();
      
      // If image is very large, resize it to speed up OCR (max 2000px on longest side)
      if (metadata.width > 2000 || metadata.height > 2000) {
        const maxDimension = 2000;
        const ratio = Math.min(maxDimension / metadata.width, maxDimension / metadata.height);
        
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
        processedImage = await sharp(file.buffer)
          .greyscale()
          .normalize()
          .sharpen()
          .toBuffer();
      }
      
      // Use faster OCR settings
      const { data: { text: ocrText } } = await Tesseract.recognize(processedImage, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
          }
        },
        // Optimize for speed
        tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?()[]{}\'"-@#$%&*+/=<>|\\_~`',
      });
      text = ocrText || "";
    } catch (ocrError) {
      console.error("OCR error:", ocrError);
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

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
      const processedImage = await sharp(file.buffer)
        .greyscale()
        .normalize()
        .sharpen()
        .toBuffer();
      
      const { data: { text: ocrText } } = await Tesseract.recognize(processedImage, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
          }
        }
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


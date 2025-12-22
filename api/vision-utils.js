const sharp = require('sharp');
const OpenAI = require('openai');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Convert PDF first page to image buffer
async function pdfToImage(pdfBuffer) {
  try {
    // Check if canvas is available (may not work on serverless)
    let canvas;
    try {
      const { createCanvas } = require('canvas');
      // Test if canvas works
      const testCanvas = createCanvas(10, 10);
      canvas = testCanvas.constructor;
    } catch (canvasError) {
      console.warn('Canvas library not available or not working:', canvasError.message);
      throw new Error('Canvas library not available in serverless environment. PDF to image conversion requires native dependencies that may not be available on Vercel.');
    }
    
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1); // Get first page
    
    const viewport = page.getViewport({ scale: 2.0 });
    
    // Create canvas
    const { createCanvas } = require('canvas');
    const actualCanvas = createCanvas(viewport.width, viewport.height);
    const context = actualCanvas.getContext('2d');
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    // Convert canvas to buffer
    const imageBuffer = actualCanvas.toBuffer('image/png');
    
    // Optimize image for Vision API
    const optimized = await sharp(imageBuffer)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    
    return optimized;
  } catch (error) {
    console.error('Error converting PDF to image:', error);
    // Provide a more helpful error message
    if (error.message.includes('Canvas') || error.message.includes('canvas')) {
      throw new Error('PDF to image conversion not available: Canvas library requires native dependencies that are not available in this serverless environment. Falling back to PDF text extraction.');
    }
    throw error;
  }
}

// Analyze document with OpenAI Vision API (for images)
async function analyzeWithVision(imageBuffer, documentType = 'POA', state = '') {
  try {
    // Optimize image size for Vision API (max 20MB, but keep reasonable)
    const optimized = await sharp(imageBuffer)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    
    // Convert image to base64
    const base64Image = optimized.toString('base64');
    
    const isPOA = documentType === 'POA';
    const systemPrompt = isPOA 
      ? "You are a document classifier analyzing a Power of Attorney document. Look at this image and determine if it is a POA document. Also extract the state mentioned if visible. Respond with JSON: {isPOA: boolean, poaType: string|null, detectedState: string|null, confidence: string}. Look for signatures, handwritten text, and state information."
      : "You are a document classifier analyzing a court-issued estate document. Look at this image and determine if it is an estate document (Letters of Administration, Letters Testamentary, etc.). Also extract the state mentioned if visible. Respond with JSON: {isEstateDocument: boolean, documentType: string|null, detectedState: string|null, confidence: string}. Look for court seals, judge signatures, handwritten text, and state information.";
    
    const userPrompt = isPOA
      ? "Analyze this document image. Is this a Power of Attorney document? What type? What state is mentioned? Can you see any handwritten signatures or text?"
      : "Analyze this document image. Is this a court-issued estate document? What type? What state is mentioned? Can you see any handwritten signatures, court seals, or text?";
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Use vision-capable model
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    return result;
  } catch (error) {
    console.error('Vision API error:', error);
    throw error;
  }
}

// Extract text from document image using Vision API (handles handwriting better)
async function extractTextWithVision(imageBuffer) {
  try {
    // Optimize image for Vision API
    const optimized = await sharp(imageBuffer)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    
    const base64Image = optimized.toString('base64');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Extract ALL text from this document image, including: printed text, handwritten text, signatures, dates, names, addresses, and any other visible text. Read handwritten text carefully. Return the text exactly as it appears, preserving line breaks and structure. If you see signatures, note them as '[Signature]' or describe what you see." 
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 4000
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Vision text extraction error:', error);
    throw error;
  }
}

module.exports = {
  pdfToImage,
  analyzeWithVision,
  extractTextWithVision
};


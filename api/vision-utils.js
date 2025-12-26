const sharp = require('sharp');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Convert PDF to image using cloud service (fallback when local conversion fails)
async function pdfToImageCloud(pdfBuffer) {
  try {
    console.log('🌐 Attempting cloud-based PDF to image conversion...');
    
    // Try using pdf.co API for PDF to image conversion
    const base64Pdf = pdfBuffer.toString('base64');
    const apiKey = process.env.PDF_CO_API_KEY || process.env.PDF_API_KEY || '';
    
    if (!apiKey) {
      throw new Error('PDF conversion API key not configured');
    }
    
    // Use pdf.co API
    try {
      console.log('📡 Calling pdf.co API for PDF conversion...');
      const response = await fetch('https://api.pdf.co/v1/pdf/convert/to/png', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          file: `data:application/pdf;base64,${base64Pdf}`,
          pages: '1',
          async: false
        })
      });
      
      console.log('📡 pdf.co API response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('❌ pdf.co API error response:', errorText);
        throw new Error(`pdf.co API returned status ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log('📡 pdf.co API result:', JSON.stringify(result).substring(0, 200));
      
      if (result.error) {
        console.error('❌ pdf.co API error:', result.error);
        throw new Error(`pdf.co API error: ${result.error}`);
      }
      
      if (result.url) {
        console.log('📥 Downloading converted image from:', result.url);
        const imageResponse = await fetch(result.url);
        
        if (!imageResponse.ok) {
          throw new Error(`Failed to download converted image: ${imageResponse.status}`);
        }
        
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        console.log('✅ Image downloaded, size:', imageBuffer.length, 'bytes');
        
        const optimized = await sharp(imageBuffer)
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
        
        console.log('✅ Cloud PDF conversion successful (pdf.co)');
        return optimized;
      } else {
        throw new Error('pdf.co API did not return an image URL');
      }
    } catch (pdfCoError) {
      console.error('❌ pdf.co conversion error:', pdfCoError.message || pdfCoError);
      throw pdfCoError; // Re-throw to be caught by outer catch
    }
    
    // If we get here, something unexpected happened
    throw new Error('Cloud PDF conversion failed: ' + (error.message || 'Unknown error'));
  } catch (error) {
    console.error('Cloud PDF conversion error:', error.message);
    throw error;
  }
}

// Convert PDF first page to image buffer
async function pdfToImage(pdfBuffer) {
  try {
    // Lazy load pdfjs-dist only when needed for PDFs (not for images)
    let pdfjsLib;
    try {
      pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    } catch (pdfjsError) {
      console.log('⚠️ PDF.js not available, trying cloud conversion...');
      // Fallback to cloud conversion
      return await pdfToImageCloud(pdfBuffer);
    }
    
    // Check if canvas is available (may not work on serverless)
    let canvas;
    try {
      const { createCanvas } = require('canvas');
      // Test if canvas works
      const testCanvas = createCanvas(10, 10);
      canvas = testCanvas.constructor;
    } catch (canvasError) {
      console.warn('Canvas library not available, trying cloud conversion...');
      // Fallback to cloud conversion
      return await pdfToImageCloud(pdfBuffer);
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
    console.error('Local PDF conversion error:', error);
    // Try cloud conversion as fallback
    try {
      console.log('🔄 Attempting cloud-based fallback conversion...');
      return await pdfToImageCloud(pdfBuffer);
    } catch (cloudError) {
      console.error('Cloud conversion also failed:', cloudError);
      // Last resort: Try sending PDF directly to Vision API
      throw new Error('PDF to image conversion failed. Both local and cloud conversion methods failed. Please convert the PDF to an image (PNG/JPG) and upload that instead.');
    }
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
  pdfToImageCloud,
  analyzeWithVision,
  extractTextWithVision
};


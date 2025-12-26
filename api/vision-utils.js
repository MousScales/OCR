const sharp = require('sharp');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Convert PDF to image using cloud service (fallback when local conversion fails)
async function pdfToImageCloud(pdfBuffer) {
  console.log('🌐 Attempting cloud-based PDF to image conversion...');
  
  const base64Pdf = pdfBuffer.toString('base64');
  const apiKey = process.env.PDF_CO_API_KEY || process.env.PDF_API_KEY || '';
  
  if (!apiKey) {
    console.error('❌ PDF conversion API key not configured in environment variables');
    throw new Error('PDF conversion API key not configured. Please set PDF_CO_API_KEY in Vercel environment variables.');
  }
  
  // Try pdf.co API - Method 1: Direct conversion
  try {
    console.log('📡 Attempting pdf.co API conversion (method 1)...');
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
      console.error('❌ pdf.co API error response:', errorText.substring(0, 500));
      throw new Error(`pdf.co API returned status ${response.status}`);
    }
    
    const result = await response.json();
    console.log('📡 pdf.co API result keys:', Object.keys(result));
    
    if (result.error) {
      console.error('❌ pdf.co API error:', result.error);
      throw new Error(`pdf.co API error: ${result.error}`);
    }
    
    // Check for different response formats
    let imageUrl = result.url || result.fileUrl || result.downloadUrl;
    
    if (imageUrl) {
      console.log('📥 Downloading converted image from:', imageUrl);
      const imageResponse = await fetch(imageUrl);
      
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
    }
    
    // Try alternative: if result has base64 image data
    if (result.file) {
      console.log('📥 Found base64 image data in response');
      const imageBuffer = Buffer.from(result.file, 'base64');
      const optimized = await sharp(imageBuffer)
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      console.log('✅ Cloud PDF conversion successful (pdf.co base64)');
      return optimized;
    }
    
    throw new Error('pdf.co API did not return an image URL or data');
  } catch (pdfCoError) {
    console.error('❌ pdf.co method 1 failed:', pdfCoError.message);
    
    // Try alternative method: Upload first, then convert
    try {
      console.log('📡 Attempting pdf.co API conversion (method 2: upload then convert)...');
      
      // First upload the PDF
      const uploadResponse = await fetch('https://api.pdf.co/v1/file/upload/base64', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          file: base64Pdf,
          name: 'document.pdf'
        })
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }
      
      const uploadResult = await uploadResponse.json();
      const uploadedFileUrl = uploadResult.url;
      
      if (!uploadedFileUrl) {
        throw new Error('Upload did not return a file URL');
      }
      
      console.log('✅ PDF uploaded, converting to image...');
      
      // Then convert to PNG
      const convertResponse = await fetch('https://api.pdf.co/v1/pdf/convert/to/png', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          url: uploadedFileUrl,
          pages: '1',
          async: false
        })
      });
      
      if (!convertResponse.ok) {
        throw new Error(`Conversion failed: ${convertResponse.status}`);
      }
      
      const convertResult = await convertResponse.json();
      const imageUrl = convertResult.url || convertResult.fileUrl;
      
      if (imageUrl) {
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const optimized = await sharp(imageBuffer)
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
        console.log('✅ Cloud PDF conversion successful (pdf.co method 2)');
        return optimized;
      }
      
      throw new Error('Conversion did not return an image URL');
    } catch (method2Error) {
      console.error('❌ pdf.co method 2 also failed:', method2Error.message);
      throw new Error(`PDF conversion failed: ${pdfCoError.message}. Alternative method also failed: ${method2Error.message}`);
    }
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
      console.log('⚠️ PDF.js not available');
      throw new Error('PDF.js library not available in serverless environment');
    }
    
    // Check if canvas is available (may not work on serverless)
    let canvas;
    try {
      const { createCanvas } = require('canvas');
      // Test if canvas works
      const testCanvas = createCanvas(10, 10);
      canvas = testCanvas.constructor;
    } catch (canvasError) {
      console.warn('Canvas library not available');
      throw new Error('Canvas library not available in serverless environment');
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
    console.error('Local PDF conversion error:', error.message || error);
    // Don't try cloud conversion here - let the caller (utils.js) handle it
    // This gives better error handling and logging control
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
  pdfToImageCloud,
  analyzeWithVision,
  extractTextWithVision
};


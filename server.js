require("dotenv").config();

const express = require("express");
const path = require("path");
const multer = require("multer");
const cors = require("cors");
const pdfParse = require("pdf-parse");
const OpenAI = require("openai");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(
  cors({
    origin: [
      "http://127.0.0.1:5500",
      "http://localhost:5500",
      "https://ocr-mu-seven.vercel.app",
      /^https:\/\/.*\.vercel\.app$/
    ],
  })
);

app.use(express.json());

// Serve static files from the public directory FIRST
app.use(express.static("public", {
  index: "main.html" // Set main.html as the default index file
}));

// Redirect root to main.html (after static file serving as fallback)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "main.html"));
});

app.post("/check-poa", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        isPOA: false,
        poaType: null,
        error: "Missing file.",
      });
    }

    console.log("File received:", file.mimetype, file.originalname, "Size:", file.size);

    // Determine file type more robustly
    const isPDF = file.mimetype.includes("pdf") || file.originalname.toLowerCase().endsWith(".pdf");
    const isImage = file.mimetype.startsWith("image/") || 
                    file.originalname.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i);

    let text = "";
    
    if (isPDF) {
      // ALWAYS convert PDF to image and use Vision API + text extraction for comprehensive analysis
      console.log("📸 Converting PDF to image and extracting text with multiple methods...");
      let pdfText = "";
      let visionText = "";
      
      // Method 1: Try standard PDF text extraction
      try {
        const pdfData = await pdfParse(file.buffer);
        pdfText = pdfData?.text || "";
        console.log("✅ PDF text extracted, length:", pdfText.length);
      } catch (parseError) {
        console.warn("PDF text extraction failed (may be scanned PDF):", parseError.message);
      }
      
      // Method 2: ALWAYS convert to image and use Vision API
      try {
        const { pdfToImage, extractTextWithVision } = require('./api/vision-utils');
        const imageBuffer = await pdfToImage(file.buffer);
        visionText = await extractTextWithVision(imageBuffer);
        console.log("✅ Vision API extracted text from PDF image, length:", visionText.length);
      } catch (visionError) {
        console.warn("Vision API failed for PDF, trying OCR fallback:", visionError.message);
        // Fallback: Use OCR on the image
        try {
          const { pdfToImage } = require('./api/vision-utils');
          const imageBuffer = await pdfToImage(file.buffer);
          const processedImage = await sharp(imageBuffer)
            .greyscale()
            .normalize()
            .sharpen()
            .toBuffer();
          const { data: { text: ocrText } } = await Tesseract.recognize(processedImage, 'eng', {
            tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?()-/\'\"',
            preserve_interword_spaces: '1'
          });
          visionText = ocrText || "";
          console.log("✅ OCR extracted text from PDF image, length:", visionText.length);
        } catch (ocrError) {
          console.error("OCR fallback also failed:", ocrError);
        }
      }
      
      // Combine both sources - prefer Vision API text as it's better for handwriting
      text = visionText || pdfText || "";
      if (visionText && pdfText) {
        // Merge both for comprehensive extraction
        text = visionText + "\n\n[Additional PDF text:]\n" + pdfText;
      }
      console.log("✅ Combined PDF text extraction complete, total length:", text.length);
      
      if (!text || text.trim().length === 0) {
        return res.status(400).json({
          isPOA: false,
          poaType: null,
          error: "Could not extract any text from PDF using any method.",
        });
      }
    } else if (isImage) {
      // Handle image files with hybrid OCR + Vision API approach
      console.log("Processing image with OCR and Vision API...");
      let ocrText = "";
      let visionText = "";
      
      try {
        // First, try Vision API for better handwriting recognition
        console.log("📸 Using Vision API for handwriting and signature recognition...");
        try {
          const { extractTextWithVision } = require('./api/vision-utils');
          visionText = await extractTextWithVision(file.buffer);
          console.log("✅ Vision API extracted text, length:", visionText.length);
        } catch (visionError) {
          console.warn("Vision API failed, falling back to OCR:", visionError.message);
        }
        
        // Also run OCR as backup/complement
        try {
          const processedImage = await sharp(file.buffer)
            .greyscale()
            .normalize()
            .sharpen()
            .toBuffer();
          
          console.log("Running OCR with handwriting support...");
          const { data: { text: ocrResult } } = await Tesseract.recognize(processedImage, 'eng', {
            logger: m => {
              if (m.status === 'recognizing text') {
                console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
              }
            },
            // Improved settings for handwriting recognition
            tessedit_pageseg_mode: '6', // Assume uniform block of text
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?()-/\'\"',
            preserve_interword_spaces: '1'
          });
          ocrText = ocrResult || "";
          console.log("OCR completed. Text length:", ocrText.length);
        } catch (ocrError) {
          console.warn("OCR failed:", ocrError.message);
        }
        
        // Combine both sources - prefer Vision API if available
        text = visionText || ocrText || "";
        if (visionText && ocrText) {
          // Merge both for comprehensive extraction
          text = visionText + "\n\n[Additional OCR text:]\n" + ocrText;
        }
        console.log("✅ Combined text extraction complete, total length:", text.length);
      } catch (error) {
        console.error("Image processing error:", error);
        return res.status(400).json({
          isPOA: false,
          poaType: null,
          error: "Could not extract text from image: " + (error.message || "Unknown error"),
        });
      }
    } else {
      console.log("Unsupported file type:", file.mimetype);
      return res.status(400).json({
        isPOA: false,
        poaType: null,
        error: "File must be a PDF or image (PNG, JPG, etc.). Received: " + file.mimetype,
      });
    }

    // If we have an image and Vision API worked, also try visual classification
    let visionClassification = null;
    if (isImage && text && text.length > 0) {
      try {
        console.log("🔍 Attempting visual classification with Vision API...");
        const { analyzeWithVision } = require('./api/vision-utils');
        visionClassification = await analyzeWithVision(file.buffer, 'POA', '');
        console.log("✅ Vision classification result:", visionClassification);
      } catch (visionError) {
        console.warn("Vision classification failed, using text-only:", visionError.message);
      }
    }

    if (!text || text.trim().length === 0) {
      // If Vision API gave us a classification, use it even without text
      if (visionClassification) {
        return res.json({
          isPOA: visionClassification.isPOA || false,
          poaType: visionClassification.poaType || null,
          detectedState: visionClassification.detectedState || null,
          confidence: visionClassification.confidence || 'medium'
        });
      }
      return res.status(400).json({
        isPOA: false,
        poaType: null,
        error: "Could not read any text from the document.",
      });
    }

    const systemPrompt =
      "You are a document classifier. Analyze the provided document text and determine if it is a Power of Attorney (POA) document. " +
      "Also extract the state mentioned in the document if present. " +
      "Respond ONLY with strict JSON, no extra text. " +
      "JSON shape:\n" +
      "{\n" +
      '  "isPOA": boolean,                    // true if this is a Power of Attorney document, false otherwise\n' +
      '  "poaType": string | null,            // if isPOA is true, specify the type (e.g., "Durable Power of Attorney", "Medical Power of Attorney", "Financial Power of Attorney", "General Power of Attorney", etc.). If false, set to null\n' +
      '  "detectedState": string | null,      // The U.S. state mentioned in the document (e.g., "California", "New York", "Texas"). Extract from phrases like "State of [X]", "under the laws of [X]", or addresses. If not found, set to null\n' +
      '  "confidence": string                 // "high", "medium", or "low" indicating confidence in the classification\n' +
      "}\n" +
      "Do not wrap the JSON in markdown. Do not add any explanation before or after the JSON.";

    const userPrompt =
      "Analyze the following document text and determine if it is a Power of Attorney document:\n\n" +
      text.slice(0, 8000); // keep within reasonable token limits

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      return res.status(500).json({ error: "No classification text was returned." });
    }

    let parsed;
    try {
      let jsonText = raw.trim();
      if (jsonText.startsWith("```")) {
        const firstBrace = jsonText.indexOf("{");
        const lastBrace = jsonText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
          jsonText = jsonText.slice(firstBrace, lastBrace + 1);
        }
      }
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error("Failed to parse classification JSON:", e, raw);
      return res.status(500).json({
        error: "Model did not return valid JSON.",
        raw,
      });
    }

    // Merge Vision API classification if available (prefer Vision for handwriting/signatures)
    if (visionClassification && visionClassification.confidence === 'high') {
      // Use Vision API result if it has high confidence
      res.json({
        isPOA: visionClassification.isPOA || parsed.isPOA,
        poaType: visionClassification.poaType || parsed.poaType,
        detectedState: visionClassification.detectedState || parsed.detectedState || null,
        confidence: visionClassification.confidence || parsed.confidence
      });
    } else {
      // Return with detected state from text analysis
      res.json({
        isPOA: parsed.isPOA,
        poaType: parsed.poaType,
        detectedState: parsed.detectedState || null,
        confidence: parsed.confidence
      });
    }
  } catch (err) {
    console.error("Error in /check-poa:", err);
    res.status(500).json({
      isPOA: false,
      poaType: null,
      detectedState: null,
      error: "Unexpected error during POA check.",
      details: err.message || String(err),
    });
  }
});

app.post("/analyze-poa", upload.single("file"), async (req, res) => {
  try {
    const state = req.body.state || ""; // State is now optional
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: "Missing file.",
      });
    }

    console.log("Analyze POA - File received:", file.mimetype, file.originalname, "Size:", file.size);

    // Determine file type more robustly - check both mimetype and extension
    const isPDF = file.mimetype.includes("pdf") || file.originalname.toLowerCase().endsWith(".pdf");
    const isImage = file.mimetype.startsWith("image/") || 
                    file.originalname.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i);

    let text = "";
    
    if (isPDF) {
      // ALWAYS convert PDF to image and use Vision API + text extraction for comprehensive analysis
      console.log("📸 Converting PDF to image and extracting text with multiple methods...");
      let pdfText = "";
      let visionText = "";
      
      // Method 1: Try standard PDF text extraction
      try {
        const pdfData = await pdfParse(file.buffer);
        pdfText = pdfData?.text || "";
        console.log("✅ PDF text extracted, length:", pdfText.length);
      } catch (parseError) {
        console.warn("PDF text extraction failed (may be scanned PDF):", parseError.message);
      }
      
      // Method 2: ALWAYS convert to image and use Vision API
      try {
        const { pdfToImage, extractTextWithVision } = require('./api/vision-utils');
        const imageBuffer = await pdfToImage(file.buffer);
        visionText = await extractTextWithVision(imageBuffer);
        console.log("✅ Vision API extracted text from PDF image, length:", visionText.length);
      } catch (visionError) {
        console.warn("Vision API failed for PDF, trying OCR fallback:", visionError.message);
        // Fallback: Use OCR on the image
        try {
          const { pdfToImage } = require('./api/vision-utils');
          const imageBuffer = await pdfToImage(file.buffer);
          const processedImage = await sharp(imageBuffer)
            .greyscale()
            .normalize()
            .sharpen()
            .toBuffer();
          const { data: { text: ocrText } } = await Tesseract.recognize(processedImage, 'eng', {
            tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?()-/\'\"',
            preserve_interword_spaces: '1'
          });
          visionText = ocrText || "";
          console.log("✅ OCR extracted text from PDF image, length:", visionText.length);
        } catch (ocrError) {
          console.error("OCR fallback also failed:", ocrError);
        }
      }
      
      // Combine both sources - prefer Vision API text as it's better for handwriting
      text = visionText || pdfText || "";
      if (visionText && pdfText) {
        // Merge both for comprehensive extraction
        text = visionText + "\n\n[Additional PDF text:]\n" + pdfText;
      }
      console.log("✅ Combined PDF text extraction complete, total length:", text.length);
      
      if (!text || text.trim().length === 0) {
        return res.status(400).json({
          error: "Could not extract any text from PDF using any method.",
        });
      }
    } else if (isImage) {
      // Handle image files with hybrid OCR + Vision API approach
      console.log("Processing image with OCR and Vision API for analysis...");
      let ocrText = "";
      let visionText = "";
      
      try {
        // First, try Vision API for better handwriting recognition
        console.log("📸 Using Vision API for handwriting and signature recognition...");
        try {
          const { extractTextWithVision } = require('./api/vision-utils');
          visionText = await extractTextWithVision(file.buffer);
          console.log("✅ Vision API extracted text, length:", visionText.length);
        } catch (visionError) {
          console.warn("Vision API failed, falling back to OCR:", visionError.message);
        }
        
        // Also run OCR as backup/complement
        try {
          const processedImage = await sharp(file.buffer)
            .greyscale()
            .normalize()
            .sharpen()
            .toBuffer();
          
          console.log("Running OCR for analysis with handwriting support...");
          const { data: { text: ocrResult } } = await Tesseract.recognize(processedImage, 'eng', {
            logger: m => {
              if (m.status === 'recognizing text') {
                console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
              }
            },
            tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?()-/\'\"',
            preserve_interword_spaces: '1'
          });
          ocrText = ocrResult || "";
          console.log("OCR completed for analysis. Text length:", ocrText.length);
        } catch (ocrError) {
          console.warn("OCR failed:", ocrError.message);
        }
        
        // Combine both sources - prefer Vision API if available
        text = visionText || ocrText || "";
        if (visionText && ocrText) {
          // Merge both for comprehensive extraction
          text = visionText + "\n\n[Additional OCR text:]\n" + ocrText;
        }
        console.log("✅ Combined text extraction complete, total length:", text.length);
      } catch (error) {
        console.error("Image processing error:", error);
        return res.status(400).json({
          error: "Could not extract text from image: " + (error.message || "Unknown error"),
        });
      }
    } else {
      console.log("Unsupported file type for analysis:", file.mimetype);
      return res.status(400).json({
        error: "File must be a PDF or image (PNG, JPG, etc.). Received: " + file.mimetype,
      });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "Could not read any text from the document.",
      });
    }

    const systemPrompt =
      "You are a paralegal assistant helping review Power of Attorney (POA) documents. " +
      "You are not a lawyer and you do not give legal advice. " +
      "Given the raw text of a POA and the U.S. state it is meant for, you must respond ONLY with strict JSON, no extra text. " +
      "JSON shape:\n" +
      "{\n" +
      '  "extractedFields": {\n' +
      '    "principalAddress": string | null,      // Address of the principal (person granting authority)\n' +
      '    "agentAddress": string | null,           // Address of the agent(s)\n' +
      '    "principalName": string | null,         // Full legal name of the principal\n' +
      '    "agentNames": string[],                 // Array of all appointed agent names\n' +
      '    "successorAgents": string[],            // Array of successor/alternate agent names, or empty array if none\n' +
      '    "stateJurisdiction": string[],          // Array of all states/jurisdictions referenced in the document\n' +
      '    "executionDate": string | null,         // Date of principal\'s signature\n' +
      '    "notarizationDate": string | null,      // Date of notarization\n' +
      '    "signatureDetected": boolean            // Whether handwritten signatures are detected\n' +
      '  },\n' +
      '  "summary": string,                         // brief summary of the POA\n' +
      '  "overallAssessment": string,              // short overall view of whether it appears compliant for that specific state, considering state-specific requirements\n' +
      '  "strengths": string[],                    // bullet-style list of what looks good / compliant\n' +
      '  "issues": string[],                       // bullet-style list of what seems missing, inconsistent, or risky\n' +
      '  "recommendations": string[],              // concrete suggestions for what to fix/add\n' +
      '  "disclaimer": string                      // clear disclaimer that this is not legal advice\n' +
      "}\n" +
      "For extractedFields: Extract addresses near 'principal' and 'agent' keywords. " +
      "Extract names after 'I, [Name]' or on signature lines. " +
      "For agents, look for 'appoint,' 'designate,' 'agent,' 'attorney-in-fact' (but not successor/alternate). " +
      "For successor agents, look for 'successor,' 'alternate,' 'if [agent] cannot serve.' " +
      "For state, look for 'State of [X],' 'under the laws of [X]' or addresses. " +
      "For dates, look near 'Signed,' 'Dated,' and in notary sections. " +
      "For signatures, just detect presence/location. " +
      "Do not wrap the JSON in markdown. Do not add any explanation before or after the JSON.";

    const stateContext = state ? `State: ${state}\n\n` : "No specific state provided. ";
    const userPrompt =
      stateContext +
      "The following text is from a Power of Attorney document. " +
      (state ? "Analyze it according to the schema above, focusing on whether it appears to follow the rules and format for this state " : "Analyze it according to the schema above, providing a general assessment ") +
      "and what might need to be corrected or added.\n\n" +
      "POA text:\n" +
      text.slice(0, 12000); // keep within reasonable token limits

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      return res.status(500).json({ error: "No analysis text was returned." });
    }

    // Try to robustly extract JSON in case the model adds code fences or text around it
    let parsed;
    try {
      let jsonText = raw.trim();

      // Strip Markdown code fences if present
      if (jsonText.startsWith("```")) {
        const firstBrace = jsonText.indexOf("{");
        const lastBrace = jsonText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonText = jsonText.slice(firstBrace, lastBrace + 1);
        }
      }

      // If it still doesn't start with "{", try to slice between first and last brace
      if (!jsonText.trim().startsWith("{")) {
        const firstBrace = jsonText.indexOf("{");
        const lastBrace = jsonText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonText = jsonText.slice(firstBrace, lastBrace + 1);
        }
      }

      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error("Failed to parse model JSON:", e, raw);
      return res.status(500).json({
        error: "Model did not return valid JSON.",
        raw,
      });
    }

    res.json({ analysis: parsed });
  } catch (err) {
    console.error("Error in /analyze-poa:", err);
    res.status(500).json({
      error: "Unexpected error during analysis.",
      details: err.message || String(err),
    });
  }
});

// Estate document analysis endpoint
app.post("/analyze-estate", upload.single("file"), async (req, res) => {
  try {
    const state = req.body.state || ""; // State is now optional
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: "Missing file.",
      });
    }

    console.log("Analyze Estate - File received:", file.mimetype, file.originalname, "Size:", file.size);

    const isPDF = file.mimetype.includes("pdf") || file.originalname.toLowerCase().endsWith(".pdf");
    const isImage = file.mimetype.startsWith("image/") || 
                    file.originalname.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i);

    let text = "";
    
    if (isPDF) {
      // ALWAYS convert PDF to image and use Vision API + text extraction for comprehensive analysis
      console.log("📸 Converting PDF to image and extracting text with multiple methods...");
      let pdfText = "";
      let visionText = "";
      
      // Method 1: Try standard PDF text extraction
      try {
        const pdfData = await pdfParse(file.buffer);
        pdfText = pdfData?.text || "";
        console.log("✅ PDF text extracted, length:", pdfText.length);
      } catch (parseError) {
        console.warn("PDF text extraction failed (may be scanned PDF):", parseError.message);
      }
      
      // Method 2: ALWAYS convert to image and use Vision API
      try {
        const { pdfToImage, extractTextWithVision } = require('./api/vision-utils');
        const imageBuffer = await pdfToImage(file.buffer);
        visionText = await extractTextWithVision(imageBuffer);
        console.log("✅ Vision API extracted text from PDF image, length:", visionText.length);
      } catch (visionError) {
        console.warn("Vision API failed for PDF, trying OCR fallback:", visionError.message);
        // Fallback: Use OCR on the image
        try {
          const { pdfToImage } = require('./api/vision-utils');
          const imageBuffer = await pdfToImage(file.buffer);
          const processedImage = await sharp(imageBuffer)
            .greyscale()
            .normalize()
            .sharpen()
            .toBuffer();
          const { data: { text: ocrText } } = await Tesseract.recognize(processedImage, 'eng', {
            tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?()-/\'\"',
            preserve_interword_spaces: '1'
          });
          visionText = ocrText || "";
          console.log("✅ OCR extracted text from PDF image, length:", visionText.length);
        } catch (ocrError) {
          console.error("OCR fallback also failed:", ocrError);
        }
      }
      
      // Combine both sources - prefer Vision API text as it's better for handwriting
      text = visionText || pdfText || "";
      if (visionText && pdfText) {
        // Merge both for comprehensive extraction
        text = visionText + "\n\n[Additional PDF text:]\n" + pdfText;
      }
      console.log("✅ Combined PDF text extraction complete, total length:", text.length);
      
      if (!text || text.trim().length === 0) {
        return res.status(400).json({
          error: "Could not extract any text from PDF using any method.",
        });
      }
    } else if (isImage) {
      // Handle image files with hybrid OCR + Vision API approach
      console.log("Processing image with OCR and Vision API for estate analysis...");
      let ocrText = "";
      let visionText = "";
      
      try {
        // First, try Vision API for better handwriting recognition
        console.log("📸 Using Vision API for handwriting and signature recognition...");
        try {
          const { extractTextWithVision } = require('./api/vision-utils');
          visionText = await extractTextWithVision(file.buffer);
          console.log("✅ Vision API extracted text, length:", visionText.length);
        } catch (visionError) {
          console.warn("Vision API failed, falling back to OCR:", visionError.message);
        }
        
        // Also run OCR as backup/complement
        try {
          const processedImage = await sharp(file.buffer)
            .greyscale()
            .normalize()
            .sharpen()
            .toBuffer();
          
          console.log("Running OCR for estate analysis with handwriting support...");
          const { data: { text: ocrResult } } = await Tesseract.recognize(processedImage, 'eng', {
            logger: m => {
              if (m.status === 'recognizing text') {
                console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
              }
            },
            tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?()-/\'\"',
            preserve_interword_spaces: '1'
          });
          ocrText = ocrResult || "";
          console.log("OCR completed for estate analysis. Text length:", ocrText.length);
        } catch (ocrError) {
          console.warn("OCR failed:", ocrError.message);
        }
        
        // Combine both sources - prefer Vision API if available
        text = visionText || ocrText || "";
        if (visionText && ocrText) {
          // Merge both for comprehensive extraction
          text = visionText + "\n\n[Additional OCR text:]\n" + ocrText;
        }
        console.log("✅ Combined text extraction complete, total length:", text.length);
      } catch (error) {
        console.error("Image processing error:", error);
        return res.status(400).json({
          error: "Could not extract text from image: " + (error.message || "Unknown error"),
        });
      }
    } else {
      return res.status(400).json({
        error: "File must be a PDF or image (PNG, JPG, etc.). Received: " + file.mimetype,
      });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "Could not read any text from the document.",
      });
    }

    const systemPrompt =
      "You are a paralegal assistant helping review court-issued estate documents (letters of administration, letters testamentary, etc.). " +
      "You are not a lawyer and you do not give legal advice. " +
      "Given the raw text of a court-issued estate document and the U.S. state it is meant for, you must respond ONLY with strict JSON, no extra text. " +
      "JSON shape:\n" +
      "{\n" +
      '  "extractedFields": {\n' +
      '    "documentType": string | null,              // "Letters of Administration", "Letters Testamentary", "Letters of Office", etc.\n' +
      '    "estateName": string | null,                  // "Estate of [Name]" or name of the estate\n' +
      '    "decedentName": string | null,                // Full legal name of the deceased individual\n' +
      '    "representativeNames": string[],              // Array of all appointed representative names\n' +
      '    "typeOfAdministration": string | null,       // "unsupervised", "supervised", "formal unsupervised", etc.\n' +
      '    "administrationLimitations": string | null,  // Any limitations or restrictions mentioned\n' +
      '    "requiresCourtApproval": boolean | null,      // Whether actions require court approval\n' +
      '    "state": string | null,                      // State where the court is located\n' +
      '    "courtName": string | null,                   // Name of the court issuing the document\n' +
      '    "judgeName": string | null,                   // Name of the judge signing the document\n' +
      '    "judgeSignatureDetected": boolean,            // Whether judge\'s signature is present\n' +
      '    "effectiveDate": string | null,              // Explicit effective date if stated\n' +
      '    "judgeSignatureDate": string | null,          // Date the judge signed the document\n' +
      '    "stampOrSealDetected": boolean,              // Whether a stamp or seal is present\n' +
      '    "expirationDate": string | null,             // Expiration date if stated\n' +
      '    "terminationClauses": string[],              // Array of termination clauses or conditions\n' +
      '    "pageCount": string | null,                   // "Page X of Y" format if available\n' +
      '    "completenessCheck": string | null            // Verification of all pages present\n' +
      '  },\n' +
      '  "summary": string,                               // brief summary of the estate document\n' +
      '  "overallAssessment": string,                    // short overall view of whether it appears compliant for that specific state, considering state-specific requirements\n' +
      '  "strengths": string[],                          // bullet-style list of what looks good / compliant\n' +
      '  "issues": string[],                             // bullet-style list of what seems missing, inconsistent, or risky\n' +
      '  "recommendations": string[],                     // concrete suggestions for what to fix/add\n' +
      '  "disclaimer": string                            // clear disclaimer that this is not legal advice\n' +
      "}\n" +
      "For extractedFields: Look for keywords like 'Executor', 'Letters of Administration', 'Letters Testamentary', 'appoints', 'representative', 'decedent', 'Estate of', 'Judge', 'Court', etc. " +
      "Extract dates near signature sections and look for page numbering. " +
      "When analyzing compliance, consider state-specific requirements for estate documents including: " +
      "required document format, signature requirements, notarization rules, court approval processes, " +
      "administration types (supervised vs unsupervised), limitations on representative authority, " +
      "state-specific terminology, and any unique state procedures or requirements. " +
      "Do not wrap the JSON in markdown. Do not add any explanation before or after the JSON.";

    const stateContext = state ? `State: ${state}\n\n` : "No specific state provided. ";
    const stateSpecificText = state ? `focusing on whether it appears to follow the rules, requirements, and format for this specific state (${state}). Consider state-specific requirements for: document format, required signatures, notarization requirements, court approval processes, administration types (supervised vs unsupervised), limitations, and any state-specific terminology or procedures. Identify what might need to be corrected or added to ensure compliance with ${state} state law.` : "providing a general assessment of the document. Consider general requirements for: document format, required signatures, notarization requirements, court approval processes, administration types (supervised vs unsupervised), limitations, and terminology.";
    const userPrompt =
      stateContext +
      "The following text is from a court-issued estate document (letters of administration, letters testamentary, etc.). " +
      "Analyze it according to the schema above, " + stateSpecificText + "\n\n" +
      "Document text:\n" +
      text.slice(0, 12000);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      return res.status(500).json({ error: "No analysis text was returned." });
    }

    let parsed;
    try {
      let jsonText = raw.trim();
      if (jsonText.startsWith("```")) {
        const firstBrace = jsonText.indexOf("{");
        const lastBrace = jsonText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonText = jsonText.slice(firstBrace, lastBrace + 1);
        }
      }
      if (!jsonText.trim().startsWith("{")) {
        const firstBrace = jsonText.indexOf("{");
        const lastBrace = jsonText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonText = jsonText.slice(firstBrace, lastBrace + 1);
        }
      }
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error("Failed to parse model JSON:", e, raw);
      return res.status(500).json({
        error: "Model did not return valid JSON.",
        raw,
      });
    }

    res.json({ analysis: parsed });
  } catch (err) {
    console.error("Error in /analyze-estate:", err);
    res.status(500).json({
      error: "Unexpected error during analysis.",
      details: err.message || String(err),
    });
  }
});

// Check if document is an estate document
app.post("/check-estate", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        isEstateDocument: false,
        documentType: null,
        error: "Missing file.",
      });
    }

    console.log("Check Estate - File received:", file.mimetype, file.originalname, "Size:", file.size);

    const isPDF = file.mimetype.includes("pdf") || file.originalname.toLowerCase().endsWith(".pdf");
    const isImage = file.mimetype.startsWith("image/") || 
                    file.originalname.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i);

    let text = "";
    
    if (isPDF) {
      // ALWAYS convert PDF to image and use Vision API + text extraction for comprehensive analysis
      console.log("📸 Converting PDF to image and extracting text with multiple methods...");
      let pdfText = "";
      let visionText = "";
      
      // Method 1: Try standard PDF text extraction
      try {
        const pdfData = await pdfParse(file.buffer);
        pdfText = pdfData?.text || "";
        console.log("✅ PDF text extracted, length:", pdfText.length);
      } catch (parseError) {
        console.warn("PDF text extraction failed (may be scanned PDF):", parseError.message);
      }
      
      // Method 2: ALWAYS convert to image and use Vision API
      try {
        const { pdfToImage, extractTextWithVision } = require('./api/vision-utils');
        const imageBuffer = await pdfToImage(file.buffer);
        visionText = await extractTextWithVision(imageBuffer);
        console.log("✅ Vision API extracted text from PDF image, length:", visionText.length);
      } catch (visionError) {
        console.warn("Vision API failed for PDF, trying OCR fallback:", visionError.message);
        // Fallback: Use OCR on the image
        try {
          const { pdfToImage } = require('./api/vision-utils');
          const imageBuffer = await pdfToImage(file.buffer);
          const processedImage = await sharp(imageBuffer)
            .greyscale()
            .normalize()
            .sharpen()
            .toBuffer();
          const { data: { text: ocrText } } = await Tesseract.recognize(processedImage, 'eng', {
            tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?()-/\'\"',
            preserve_interword_spaces: '1'
          });
          visionText = ocrText || "";
          console.log("✅ OCR extracted text from PDF image, length:", visionText.length);
        } catch (ocrError) {
          console.error("OCR fallback also failed:", ocrError);
        }
      }
      
      // Combine both sources - prefer Vision API text as it's better for handwriting
      text = visionText || pdfText || "";
      if (visionText && pdfText) {
        // Merge both for comprehensive extraction
        text = visionText + "\n\n[Additional PDF text:]\n" + pdfText;
      }
      console.log("✅ Combined PDF text extraction complete, total length:", text.length);
      
      if (!text || text.trim().length === 0) {
        return res.status(400).json({
          isEstateDocument: false,
          documentType: null,
          error: "Could not extract any text from PDF using any method.",
        });
      }
    } else if (isImage) {
      // Handle image files with hybrid OCR + Vision API approach
      console.log("Processing image with OCR and Vision API for estate check...");
      let ocrText = "";
      let visionText = "";
      
      try {
        // First, try Vision API for better handwriting recognition
        console.log("📸 Using Vision API for handwriting and signature recognition...");
        try {
          const { extractTextWithVision } = require('./api/vision-utils');
          visionText = await extractTextWithVision(file.buffer);
          console.log("✅ Vision API extracted text, length:", visionText.length);
        } catch (visionError) {
          console.warn("Vision API failed, falling back to OCR:", visionError.message);
        }
        
        // Also run OCR as backup/complement
        try {
          const processedImage = await sharp(file.buffer)
            .greyscale()
            .normalize()
            .sharpen()
            .toBuffer();
          
          console.log("Running OCR for estate check with handwriting support...");
          const { data: { text: ocrResult } } = await Tesseract.recognize(processedImage, 'eng', {
            logger: m => {
              if (m.status === 'recognizing text') {
                console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
              }
            },
            tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?()-/\'\"',
            preserve_interword_spaces: '1'
          });
          ocrText = ocrResult || "";
          console.log("OCR completed for estate check. Text length:", ocrText.length);
        } catch (ocrError) {
          console.warn("OCR failed:", ocrError.message);
        }
        
        // Combine both sources - prefer Vision API if available
        text = visionText || ocrText || "";
        if (visionText && ocrText) {
          // Merge both for comprehensive extraction
          text = visionText + "\n\n[Additional OCR text:]\n" + ocrText;
        }
        console.log("✅ Combined text extraction complete, total length:", text.length);
      } catch (error) {
        console.error("Image processing error:", error);
        return res.status(400).json({
          isEstateDocument: false,
          documentType: null,
          error: "Could not extract text from image: " + (error.message || "Unknown error"),
        });
      }
    } else {
      return res.status(400).json({
        isEstateDocument: false,
        documentType: null,
        error: "File must be a PDF or image (PNG, JPG, etc.). Received: " + file.mimetype,
      });
    }

    // If we have an image and Vision API worked, also try visual classification
    let visionClassification = null;
    if (isImage && text && text.length > 0) {
      try {
        console.log("🔍 Attempting visual classification with Vision API for estate document...");
        const { analyzeWithVision } = require('./api/vision-utils');
        visionClassification = await analyzeWithVision(file.buffer, 'ESTATE', '');
        console.log("✅ Vision classification result:", visionClassification);
      } catch (visionError) {
        console.warn("Vision classification failed, using text-only:", visionError.message);
      }
    }

    if (!text || text.trim().length === 0) {
      // If Vision API gave us a classification, use it even without text
      if (visionClassification) {
        return res.json({
          isEstateDocument: visionClassification.isEstateDocument || false,
          documentType: visionClassification.documentType || null,
          detectedState: visionClassification.detectedState || null,
          confidence: visionClassification.confidence || 'medium'
        });
      }
      return res.status(400).json({
        isEstateDocument: false,
        documentType: null,
        error: "Could not read any text from the document.",
      });
    }

    const systemPrompt =
      "You are a document classifier. Analyze the provided document text and determine if it is a court-issued estate document. " +
      "Also extract the state mentioned in the document if present. " +
      "Respond ONLY with strict JSON, no extra text. " +
      "JSON shape:\n" +
      "{\n" +
      '  "isEstateDocument": boolean,                    // true if this is a court-issued estate document, false otherwise\n' +
      '  "documentType": string | null,                  // if isEstateDocument is true, specify the type (e.g., "Letters of Administration", "Letters Testamentary", "Letters of Office", "Certification of Qualification/Administration", "Letters of Authority"). If false, set to null\n' +
      '  "detectedState": string | null,                 // The U.S. state mentioned in the document (e.g., "California", "New York", "Texas"). Extract from phrases like "State of [X]", "under the laws of [X]", court names, or addresses. If not found, set to null\n' +
      '  "confidence": string                            // "high", "medium", or "low" indicating confidence in the classification\n' +
      "}\n" +
      "Look for keywords: 'Executor', 'Letters of Administration', 'Letters Testamentary', 'Letters of Office', 'Certification of Qualification/Administration', 'Letters of Authority'. " +
      "Note: Small estate affidavits are NOT court-issued documents and should return isEstateDocument: false. " +
      "Do not wrap the JSON in markdown. Do not add any explanation before or after the JSON.";

    const userPrompt =
      "Analyze the following document text and determine if it is a court-issued estate document. " +
      "Also extract the U.S. state mentioned in the document (look for 'State of [X]', 'under the laws of [X]', court names, or state names in addresses):\n\n" +
      text.slice(0, 8000);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      return res.status(500).json({ error: "No classification text was returned." });
    }

    let parsed;
    try {
      let jsonText = raw.trim();
      if (jsonText.startsWith("```")) {
        const firstBrace = jsonText.indexOf("{");
        const lastBrace = jsonText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
          jsonText = jsonText.slice(firstBrace, lastBrace + 1);
        }
      }
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error("Failed to parse classification JSON:", e, raw);
      return res.status(500).json({
        isEstateDocument: false,
        documentType: null,
        detectedState: null,
        error: "Model did not return valid JSON.",
        raw,
      });
    }

    // Merge Vision API classification if available (prefer Vision for handwriting/signatures)
    if (visionClassification && visionClassification.confidence === 'high') {
      // Use Vision API result if it has high confidence
      res.json({
        isEstateDocument: visionClassification.isEstateDocument || parsed.isEstateDocument,
        documentType: visionClassification.documentType || parsed.documentType,
        detectedState: visionClassification.detectedState || parsed.detectedState || null,
        confidence: visionClassification.confidence || parsed.confidence
      });
    } else {
      // Return with detected state from text analysis
      res.json({
        isEstateDocument: parsed.isEstateDocument,
        documentType: parsed.documentType,
        detectedState: parsed.detectedState || null,
        confidence: parsed.confidence
      });
    }
  } catch (err) {
    console.error("Error in /check-estate:", err);
    res.status(500).json({
      isEstateDocument: false,
      documentType: null,
      error: "Unexpected error during estate check.",
      details: err.message || String(err),
    });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Analysis server listening on http://localhost:${port}`);
});



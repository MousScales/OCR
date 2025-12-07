require("dotenv").config();

const express = require("express");
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
    origin: ["http://127.0.0.1:5500", "http://localhost:5500"],
  })
);

app.use(express.json());

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
      let pdfData;
      try {
        pdfData = await pdfParse(file.buffer);
        text = pdfData?.text || "";
      } catch (parseError) {
        console.error("PDF parse error:", parseError);
        return res.status(400).json({
          isPOA: false,
          poaType: null,
          error: "Could not parse PDF file.",
        });
      }
    } else if (isImage) {
      // Handle image files with OCR
      console.log("Processing image with OCR...");
      try {
        // Process image with sharp to optimize for OCR
        const processedImage = await sharp(file.buffer)
          .greyscale()
          .normalize()
          .sharpen()
          .toBuffer();
        
        console.log("Running OCR...");
        const { data: { text: ocrText } } = await Tesseract.recognize(processedImage, 'eng', {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        });
        text = ocrText || "";
        console.log("OCR completed. Text length:", text.length);
      } catch (ocrError) {
        console.error("OCR error:", ocrError);
        return res.status(400).json({
          isPOA: false,
          poaType: null,
          error: "Could not extract text from image: " + (ocrError.message || "Unknown error"),
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

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        isPOA: false,
        poaType: null,
        error: "Could not read any text from the document.",
      });
    }

    const systemPrompt =
      "You are a document classifier. Analyze the provided document text and determine if it is a Power of Attorney (POA) document. " +
      "Respond ONLY with strict JSON, no extra text. " +
      "JSON shape:\n" +
      "{\n" +
      '  "isPOA": boolean,                    // true if this is a Power of Attorney document, false otherwise\n' +
      '  "poaType": string | null,            // if isPOA is true, specify the type (e.g., "Durable Power of Attorney", "Medical Power of Attorney", "Financial Power of Attorney", "General Power of Attorney", etc.). If false, set to null\n' +
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

    res.json(parsed);
  } catch (err) {
    console.error("Error in /check-poa:", err);
    res.status(500).json({
      isPOA: false,
      poaType: null,
      error: "Unexpected error during POA check.",
      details: err.message || String(err),
    });
  }
});

app.post("/analyze-poa", upload.single("file"), async (req, res) => {
  try {
    const state = req.body.state;
    const file = req.file;

    if (!state || !file) {
      return res.status(400).json({
        error: "Missing state or file.",
      });
    }

    console.log("Analyze POA - File received:", file.mimetype, file.originalname, "Size:", file.size);

    // Determine file type more robustly - check both mimetype and extension
    const isPDF = file.mimetype.includes("pdf") || file.originalname.toLowerCase().endsWith(".pdf");
    const isImage = file.mimetype.startsWith("image/") || 
                    file.originalname.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i);

    let text = "";
    
    if (isPDF) {
      const pdfData = await pdfParse(file.buffer);
      text = pdfData.text;
    } else if (isImage) {
      // Handle image files with OCR
      console.log("Processing image with OCR for analysis...");
      try {
        // Process image with sharp to optimize for OCR
        const processedImage = await sharp(file.buffer)
          .greyscale()
          .normalize()
          .sharpen()
          .toBuffer();
        
        console.log("Running OCR for analysis...");
        const { data: { text: ocrText } } = await Tesseract.recognize(processedImage, 'eng', {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        });
        text = ocrText || "";
        console.log("OCR completed for analysis. Text length:", text.length);
      } catch (ocrError) {
        console.error("OCR error:", ocrError);
        return res.status(400).json({
          error: "Could not extract text from image: " + (ocrError.message || "Unknown error"),
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
      '  "overallAssessment": string,              // short overall view of whether it appears compliant for that state\n' +
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

    const userPrompt =
      `State: ${state}\n\n` +
      "The following text is from a Power of Attorney document. " +
      "Analyze it according to the schema above, focusing on whether it appears to follow the rules and format for this state " +
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

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Analysis server listening on http://localhost:${port}`);
});



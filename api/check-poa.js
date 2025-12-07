const OpenAI = require("openai");
const Busboy = require("busboy");
const { extractTextFromFile } = require("./utils");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function parseMultipartFormData(req) {
  return new Promise((resolve, reject) => {
    try {
      const busboy = Busboy({ headers: req.headers });
      const fields = {};
      let file = null;
      let fileResolved = false;

      busboy.on('file', (name, fileStream, info) => {
        const { filename, encoding, mimeType } = info;
        const chunks = [];

        fileStream.on('data', (chunk) => {
          chunks.push(chunk);
        });

        fileStream.on('end', () => {
          file = {
            fieldname: name,
            originalname: filename,
            encoding: encoding,
            mimetype: mimeType,
            buffer: Buffer.concat(chunks),
            size: Buffer.concat(chunks).length
          };
          fileResolved = true;
        });

        fileStream.on('error', (err) => {
          console.error('File stream error:', err);
          if (!fileResolved) {
            reject(err);
          }
        });
      });

      busboy.on('field', (name, value) => {
        fields[name] = value;
      });

      busboy.on('finish', () => {
        // Give a small delay to ensure file is processed
        setTimeout(() => {
          resolve({ fields, file });
        }, 100);
      });

      busboy.on('error', (err) => {
        console.error('Busboy error:', err);
        reject(err);
      });

      // Handle request body - Vercel might have already consumed it
      if (req.body && typeof req.body === 'object' && !req.body.pipe) {
        // Body already parsed, need to reconstruct
        reject(new Error('Request body already parsed. Vercel may need different handling.'));
      } else {
        req.pipe(busboy);
      }
    } catch (err) {
      console.error('Parse error:', err);
      reject(err);
    }
  });
}

module.exports = async (req, res) => {
  // Set CORS headers
  const allowedOrigins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://ocr-mu-seven.vercel.app"
  ];
  
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || origin.includes('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Ensure request is readable
    if (!req.readable) {
      return res.status(400).json({
        isPOA: false,
        poaType: null,
        error: "Request body not readable. Please ensure Content-Type is multipart/form-data.",
      });
    }

    const { file } = await parseMultipartFormData(req);

    if (!file) {
      return res.status(400).json({
        isPOA: false,
        poaType: null,
        error: "Missing file.",
      });
    }

    console.log("File received:", file.mimetype, file.originalname, "Size:", file.size);

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        isPOA: false,
        poaType: null,
        error: "File too large (max 10MB)",
      });
    }

    let text;
    try {
      text = await extractTextFromFile(file);
    } catch (extractError) {
      return res.status(400).json({
        isPOA: false,
        poaType: null,
        error: extractError.message,
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
        error: "Model did not return valid JSON.",
        raw,
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Error in /check-poa:", err);
    return res.status(500).json({
      isPOA: false,
      poaType: null,
      error: "Unexpected error during POA check.",
      details: err.message || String(err),
    });
  }
};

const OpenAI = require("openai");
const Busboy = require("busboy");
const { extractTextFromFile } = require("./utils");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function parseMultipartFormData(req) {
  return new Promise((resolve, reject) => {
    try {
      // Vercel provides req as a stream
      const busboy = Busboy({ headers: req.headers });
      const fields = {};
      let file = null;
      let fileResolved = false;
      let finished = false;

      const timeout = setTimeout(() => {
        if (!finished) {
          finished = true;
          reject(new Error('Request timeout while parsing form data'));
        }
      }, 5000); // 5 second timeout for parsing

      busboy.on('file', (name, fileStream, info) => {
        const { filename, encoding, mimeType } = info;
        const chunks = [];

        fileStream.on('data', (chunk) => {
          chunks.push(chunk);
        });

        fileStream.on('end', () => {
          if (!fileResolved) {
            file = {
              fieldname: name,
              originalname: filename,
              encoding: encoding,
              mimetype: mimeType,
              buffer: Buffer.concat(chunks),
              size: Buffer.concat(chunks).length
            };
            fileResolved = true;
          }
        });

        fileStream.on('error', (err) => {
          console.error('File stream error:', err);
          if (!finished) {
            finished = true;
            clearTimeout(timeout);
            reject(err);
          }
        });
      });

      busboy.on('field', (name, value) => {
        fields[name] = value;
      });

      busboy.on('finish', () => {
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          // Small delay to ensure file is fully processed
          setTimeout(() => {
            resolve({ fields, file });
          }, 50);
        }
      });

      busboy.on('error', (err) => {
        console.error('Busboy error:', err);
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      // Pipe the request to busboy
      if (req.on && typeof req.on === 'function') {
        req.pipe(busboy);
      } else {
        // If req is not a stream, try to read it
        if (req.body) {
          reject(new Error('Request body already consumed. Use multipart/form-data.'));
        } else {
          reject(new Error('Cannot parse request body.'));
        }
      }
    } catch (err) {
      console.error('Parse error:', err);
      reject(err);
    }
  });
}

module.exports = async (req, res) => {
  console.log('🚀 check-poa function called');
  console.log('📋 Request method:', req.method);
  console.log('📋 Request URL:', req.url);
  console.log('📋 Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('🌍 Environment:', process.env.VERCEL ? 'Vercel' : 'Local');
  
  // Set CORS headers immediately
  const origin = req.headers.origin || req.headers.Origin;
  console.log('🌐 Origin:', origin);
  
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Allow all origins in development
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS request, returning 200');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed', received: req.method });
  }
  
  console.log('✅ POST request received, starting processing...');

  // Set a timeout for the entire function
  // Vercel free tier has 10s limit, Pro has up to 60s
  // We'll use 55s to leave buffer
  const functionTimeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error('⏱️ Function timeout reached');
      res.status(504).json({
        isPOA: false,
        poaType: null,
        error: "Request timed out. The file may be too large or processing took too long. Try a smaller file or upgrade to Vercel Pro for longer timeouts.",
      });
    }
  }, 55000); // 55 seconds (leaving 5s buffer for Vercel)

  try {
    const { file } = await parseMultipartFormData(req);

    if (!file) {
      clearTimeout(functionTimeout);
      return res.status(400).json({
        isPOA: false,
        poaType: null,
        error: "Missing file.",
      });
    }

    console.log("File received:", file.mimetype, file.originalname, "Size:", file.size);

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      clearTimeout(functionTimeout);
      return res.status(400).json({
        isPOA: false,
        poaType: null,
        error: "File too large (max 10MB)",
      });
    }

    // Extract text with timeout
    let text;
    try {
      const extractTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Text extraction timeout')), 30000)
      );
      
      text = await Promise.race([
        extractTextFromFile(file),
        extractTimeout
      ]);
    } catch (extractError) {
      clearTimeout(functionTimeout);
      return res.status(400).json({
        isPOA: false,
        poaType: null,
        error: extractError.message || "Failed to extract text from file",
      });
    }

    // Call OpenAI with timeout
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

    const openaiTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OpenAI API timeout')), 20000)
    );

    const completion = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
      openaiTimeout
    ]);

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      clearTimeout(functionTimeout);
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
      clearTimeout(functionTimeout);
      return res.status(500).json({
        error: "Model did not return valid JSON.",
        raw,
      });
    }

    clearTimeout(functionTimeout);
    return res.status(200).json(parsed);
  } catch (err) {
    clearTimeout(functionTimeout);
    console.error("Error in /check-poa:", err);
    return res.status(500).json({
      isPOA: false,
      poaType: null,
      error: "Unexpected error during POA check.",
      details: err.message || String(err),
    });
  }
};

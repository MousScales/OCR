const OpenAI = require("openai");
const Busboy = require("busboy");
const { extractTextFromFile } = require("./utils");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  // Set CORS headers first
  const origin = req.headers.origin || req.headers.Origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('🚀 check-estate function called');

  try {
    // Parse multipart form data
    const { file } = await new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });
      let file = null;
      let finished = false;

      const timeout = setTimeout(() => {
        if (!finished) {
          finished = true;
          reject(new Error('Form parsing timeout'));
        }
      }, 10000);

      busboy.on('file', (name, stream, info) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          file = {
            fieldname: name,
            originalname: info.filename,
            mimetype: info.mimeType,
            buffer: Buffer.concat(chunks),
            size: Buffer.concat(chunks).length
          };
        });
      });

      busboy.on('finish', () => {
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          resolve({ file });
        }
      });

      busboy.on('error', (err) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      req.pipe(busboy);
    });

    if (!file) {
      return res.status(400).json({
        isEstateDocument: false,
        documentType: null,
        error: "Missing file"
      });
    }

    console.log('✅ File received:', file.originalname, file.mimetype, file.size, 'bytes');

    // Check file size
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        isEstateDocument: false,
        documentType: null,
        error: "File too large (max 10MB)"
      });
    }

    // Extract text
    console.log('📝 Extracting text from file...');
    let text;
    try {
      text = await extractTextFromFile(file);
      console.log('✅ Text extracted, length:', text.length);
    } catch (extractError) {
      const errorMsg = extractError?.message || String(extractError || 'Unknown error');
      console.error('❌ Text extraction error:', errorMsg);
      console.error('❌ Full error details:', {
        name: extractError?.name,
        message: errorMsg,
        stack: extractError?.stack?.substring(0, 500) // First 500 chars of stack
      });
      return res.status(400).json({
        isEstateDocument: false,
        documentType: null,
        error: errorMsg || "Failed to extract text"
      });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        isEstateDocument: false,
        documentType: null,
        error: "No text found in document"
      });
    }

    // Call OpenAI
    console.log('🤖 Calling OpenAI for classification...');
    const systemPrompt = `You are a document classifier. Analyze the provided document text and determine if it is an estate document. Estate documents include both court-issued documents (letters of administration, letters testamentary, letters of office, certification of qualification/administration, letters of authority) and small estate affidavits.
Also extract the state mentioned in the document if present.
Respond ONLY with valid JSON, no extra text.
JSON format:
{
  "isEstateDocument": boolean,
  "documentType": string | null,
  "detectedState": string | null,
  "confidence": "high" | "medium" | "low"
}

Document types to look for:
- "Letters of Administration"
- "Letters Testamentary"
- "Letters of Office"
- "Certification of Qualification/Administration"
- "Letters of Authority"
- "Executor" (if it's a court-issued letter appointing an executor)
- "Small Estate Affidavit" (also known as "Affidavit for Collection of Small Estate", "Small Estate Affidavit of Collection", or similar state-specific names)

Note: Small estate affidavits ARE estate documents and should return isEstateDocument: true with documentType: "Small Estate Affidavit".`;

    const userPrompt = `Analyze this document text and determine if it is a court-issued estate document. Also extract the U.S. state mentioned in the document (look for 'State of [X]', 'under the laws of [X]', court names, or state names in addresses):\n\n${text.slice(0, 8000)}`;

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 200
      });
    } catch (openaiError) {
      console.error('❌ OpenAI error:', openaiError);
      return res.status(500).json({
        isEstateDocument: false,
        documentType: null,
        error: "AI service error"
      });
    }

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return res.status(500).json({
        isEstateDocument: false,
        documentType: null,
        error: "No response from AI"
      });
    }

    // Parse response
    let parsed;
    try {
      let jsonText = raw.trim();
      if (jsonText.startsWith('```')) {
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          jsonText = jsonText.slice(firstBrace, lastBrace + 1);
        }
      }
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError, 'Raw:', raw);
      return res.status(500).json({
        isEstateDocument: false,
        documentType: null,
        error: "Invalid AI response format"
      });
    }

    console.log('✅ Classification complete');
    return res.status(200).json({
      isEstateDocument: parsed.isEstateDocument,
      documentType: parsed.documentType,
      detectedState: parsed.detectedState || null,
      confidence: parsed.confidence
    });

  } catch (error) {
    console.error('❌ Function error:', error);
    return res.status(500).json({
      isEstateDocument: false,
      documentType: null,
      error: error.message || "Internal server error"
    });
  }
};


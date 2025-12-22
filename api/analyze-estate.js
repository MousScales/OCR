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

  console.log('🚀 analyze-estate function called');
  console.log('📋 Method:', req.method);

  try {
    // Parse multipart form data
    const { fields, file } = await new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });
      const fields = {};
      let file = null;
      let finished = false;

      const timeout = setTimeout(() => {
        if (!finished) {
          finished = true;
          reject(new Error('Form parsing timeout'));
        }
      }, 10000);

      busboy.on('field', (name, value) => {
        fields[name] = value;
      });

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
          resolve({ fields, file });
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

    const state = fields.state;
    if (!state || !file) {
      return res.status(400).json({
        error: "Missing state or file"
      });
    }

    console.log('✅ File received:', file.originalname, file.mimetype, file.size, 'bytes');
    console.log('✅ State:', state);

    // Check file size
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
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
      console.error('❌ Text extraction error:', extractError);
      return res.status(400).json({
        error: extractError.message || "Failed to extract text"
      });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "No text found in document"
      });
    }

    // Call OpenAI
    console.log('🤖 Calling OpenAI for analysis...');
    const systemPrompt = `You are a paralegal assistant helping review court-issued estate documents (letters of administration, letters testamentary, etc.). You are not a lawyer and do not give legal advice.
Given the raw text of a court-issued estate document and the U.S. state, respond ONLY with valid JSON, no extra text.
JSON format:
{
  "extractedFields": {
    "documentType": string | null,
    "estateName": string | null,
    "decedentName": string | null,
    "representativeNames": string[],
    "typeOfAdministration": string | null,
    "administrationLimitations": string | null,
    "requiresCourtApproval": boolean | null,
    "state": string | null,
    "courtName": string | null,
    "judgeName": string | null,
    "judgeSignatureDetected": boolean,
    "effectiveDate": string | null,
    "judgeSignatureDate": string | null,
    "stampOrSealDetected": boolean,
    "expirationDate": string | null,
    "terminationClauses": string[],
    "pageCount": string | null,
    "completenessCheck": string | null
  },
  "summary": string,
  "overallAssessment": string,  // short overall view of whether it appears compliant for that specific state, considering state-specific requirements
  "strengths": string[],
  "issues": string[],
  "recommendations": string[],
  "disclaimer": string
}

Extraction guidelines:
- documentType: Look for "Executor", "Letters of Administration", "Letters Testamentary", "Letters of Office", "Certification of Qualification/Administration", "Letters of Authority". Flag if misclassified.
- estateName: Look for "Estate of [Name]" or the name of the decedent
- decedentName: Full legal name of the deceased individual
- representativeNames: Names of appointed representative(s) - look for "executor", "representative", "executrix", "personal representative", "appoints"
- typeOfAdministration: Look for "unsupervised", "supervised", "formal unsupervised", "formal supervised"
- administrationLimitations: Any limitations or restrictions mentioned
- requiresCourtApproval: Whether actions require court approval
- state: State where the court is located
- courtName: Name of the court issuing the document
- judgeName: Name of the judge signing the document
- judgeSignatureDetected: Whether judge's signature is present
- effectiveDate: Explicit effective date if stated, otherwise use judge signature date
- judgeSignatureDate: Date the judge signed the document
- stampOrSealDetected: Whether a stamp or seal is present
- expirationDate: Expiration date if stated
- terminationClauses: Any termination clauses or conditions
- pageCount: "Page X of Y" format if available
- completenessCheck: Verify all pages present, flag missing or out-of-order pages

When analyzing compliance, consider state-specific requirements for estate documents including: required document format, signature requirements, notarization rules, court approval processes, administration types (supervised vs unsupervised), limitations on representative authority, state-specific terminology, and any unique state procedures or requirements.`;

    const userPrompt = `State: ${state}\n\nAnalyze this court-issued estate document text according to the schema above, focusing on whether it appears to follow the rules, requirements, and format for this specific state (${state}). 
Consider state-specific requirements for: document format, required signatures, notarization requirements, court approval processes, administration types (supervised vs unsupervised), limitations, and any state-specific terminology or procedures. 
Identify what might need to be corrected or added to ensure compliance with ${state} state law.\n\nDocument text:\n\n${text.slice(0, 12000)}`;

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 2000
      });
    } catch (openaiError) {
      console.error('❌ OpenAI error:', openaiError);
      return res.status(500).json({
        error: "AI service error"
      });
    }

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return res.status(500).json({
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
        error: "Invalid AI response format"
      });
    }

    console.log('✅ Analysis complete');
    return res.status(200).json({ analysis: parsed });

  } catch (error) {
    console.error('❌ Function error:', error);
    return res.status(500).json({
      error: error.message || "Internal server error"
    });
  }
};


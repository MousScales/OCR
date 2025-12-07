const OpenAI = require("openai");
const Busboy = require("busboy");
const { extractTextFromFile } = require("./utils");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function parseMultipartFormData(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    let file = null;

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
      });
    });

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('finish', () => {
      resolve({ fields, file });
    });

    busboy.on('error', (err) => {
      reject(err);
    });

    req.pipe(busboy);
  });
}

module.exports = async (req, res) => {
  // Set CORS headers
  const allowedOrigins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://ocr-mu-seven.vercel.app",
    "https://*.vercel.app"
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
    const { fields, file } = await parseMultipartFormData(req);
    const state = fields.state;

    if (!state || !file) {
      return res.status(400).json({
        error: "Missing state or file.",
      });
    }

    console.log("Analyze POA - File received:", file.mimetype, file.originalname, "Size:", file.size);

    let text;
    try {
      text = await extractTextFromFile(file);
    } catch (extractError) {
      return res.status(400).json({
        error: extractError.message,
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

    return res.status(200).json({ analysis: parsed });
  } catch (err) {
    console.error("Error in /analyze-poa:", err);
    return res.status(500).json({
      error: "Unexpected error during analysis.",
      details: err.message || String(err),
    });
  }
};


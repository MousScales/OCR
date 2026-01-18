// Serverless function to proxy Firebase Storage files (avoids CORS)
// Works on Vercel deployment

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: "Missing file path" });
    }

    // Construct Firebase Storage URL
    const encodedPath = encodeURIComponent(filePath);
    const storageUrl = `https://firebasestorage.googleapis.com/v0/b/ocrr-b4765.firebasestorage.app/o/${encodedPath}?alt=media`;
    
    // Fetch the file
    const response = await fetch(storageUrl);
    if (!response.ok) {
      // Try with token if available
      const token = req.query.token;
      if (token) {
        const tokenUrl = `${storageUrl}&token=${token}`;
        const tokenResponse = await fetch(tokenUrl);
        if (tokenResponse.ok) {
          const buffer = await tokenResponse.arrayBuffer();
          const contentType = tokenResponse.headers.get('content-type') || 'application/octet-stream';
          res.setHeader('Content-Type', contentType);
          return res.send(Buffer.from(buffer));
        }
      }
      return res.status(response.status).json({ error: `Failed to fetch file: ${response.statusText}` });
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch file' });
  }
};


// Supabase Configuration
window.SUPABASE_URL = 'https://qecirwhseouzckdlqipg.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlY2lyd2hzZW91emNrZGxxaXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwNzYyODQsImV4cCI6MjA4MDY1MjI4NH0.ar6x-jUzJwKa6WtmM6vnHXmYnARQuLNN0OifdLMbOTo';

// Create Supabase client
let supabase = null;
if (window.supabase) {
  supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  console.log('Supabase client initialized');
}

// PIN Authentication
const CORRECT_PIN = "11335";
const pinOverlay = document.getElementById('pin-overlay');
const pinInput = document.getElementById('pin-input');
const pinSubmit = document.getElementById('pin-submit');
const pinError = document.getElementById('pin-error');
const mainContent = document.getElementById('main-content');

// Check if already authenticated
if (sessionStorage.getItem('authenticated') === 'true') {
  pinOverlay.style.display = 'none';
  mainContent.classList.add('authenticated');
} else {
  pinOverlay.style.display = 'flex';
  mainContent.classList.remove('authenticated');
}

pinSubmit.addEventListener('click', () => {
  const enteredPin = pinInput.value.trim();
  if (enteredPin === CORRECT_PIN) {
    sessionStorage.setItem('authenticated', 'true');
    pinOverlay.style.display = 'none';
    mainContent.classList.add('authenticated');
    pinInput.value = '';
    pinError.classList.remove('show');
  } else {
    pinError.classList.add('show');
    pinInput.value = '';
    pinInput.focus();
  }
});

pinInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    pinSubmit.click();
  }
});

// Get section from URL
const urlParams = new URLSearchParams(window.location.search);
const section = urlParams.get('section') || 'poa';
const sectionTitle = document.getElementById('section-title');
sectionTitle.textContent = section.toUpperCase();

// Current document state
let currentDocument = null;

// Load documents
async function loadDocuments() {
  const documentsList = document.getElementById('documents-list');
  documentsList.innerHTML = '<div class="empty-state">Loading documents...</div>';

  let documents = [];
  
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, name, type, size, created_at, analysis_data, file_path')
        .eq('section', section)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading documents:', error);
        documents = JSON.parse(localStorage.getItem(`${section}_documents`) || '[]');
      } else {
        documents = (data || []).map(doc => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          size: doc.size,
          date: doc.created_at,
          hasAnalysis: !!doc.analysis_data,
          file_path: doc.file_path || null
        }));
        localStorage.setItem(`${section}_documents`, JSON.stringify(documents));
      }
    } catch (err) {
      console.error('Supabase error:', err);
      documents = JSON.parse(localStorage.getItem(`${section}_documents`) || '[]');
    }
  } else {
    documents = JSON.parse(localStorage.getItem(`${section}_documents`) || '[]');
  }

  if (documents.length === 0) {
    documentsList.innerHTML = '<div class="empty-state">No documents in this section yet</div>';
    return;
  }

  documentsList.innerHTML = documents.map(doc => {
    const date = new Date(doc.date || doc.created_at).toLocaleDateString();
    const size = doc.size ? ` (${formatFileSize(doc.size)})` : '';
    const analysisBadge = doc.hasAnalysis ? '<span style="color: #059669; font-size: 11px;">✓ Analyzed</span>' : '';
    return `
      <div class="document-item" data-doc-id="${doc.id || ''}" data-doc-name="${escapeHtml(doc.name)}" data-doc-type="${escapeHtml(doc.type || '')}">
        <div class="document-content">
          <div class="document-name">${escapeHtml(doc.name)}${size}</div>
          <div class="document-meta">
            <span>${date}</span>
            ${analysisBadge}
          </div>
        </div>
        <button class="delete-document-btn" data-doc-id="${doc.id || ''}" data-doc-path="${escapeHtml(doc.file_path || '')}" title="Delete document">×</button>
      </div>
    `;
  }).join('');

  // Add click handlers
  documentsList.querySelectorAll('.document-item').forEach(item => {
    item.addEventListener('click', function() {
      documentsList.querySelectorAll('.document-item').forEach(i => i.classList.remove('active'));
      this.classList.add('active');
      
      const docId = this.getAttribute('data-doc-id');
      const docName = this.getAttribute('data-doc-name');
      const docType = this.getAttribute('data-doc-type');
      
      loadDocument(docId, docName, docType);
    });
  });
}

// Load and display document
async function loadDocument(docId, docName, docType) {
  const viewerTitle = document.getElementById('viewer-title');
  const viewerPlaceholder = document.getElementById('viewer-placeholder');
  const pdfViewer = document.getElementById('pdf-viewer');
  const imageViewer = document.getElementById('image-viewer');
  const closeBtn = document.getElementById('close-viewer-btn');
  const analysisBody = document.getElementById('analysis-body');
  const analysisMeta = document.getElementById('analysis-meta');
  const analyzeControls = document.getElementById('analyze-controls');

  viewerTitle.textContent = docName;
  closeBtn.style.display = 'block';
  
  // Hide placeholders
  viewerPlaceholder.style.display = 'none';
  pdfViewer.style.display = 'none';
  imageViewer.style.display = 'none';

  if (supabase && docId) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('file_path, file_data, analysis_data')
        .eq('id', docId)
        .single();

      if (!error && data) {
        currentDocument = {
          id: docId,
          name: docName,
          type: docType,
          filePath: data.file_path || null,
          fileData: data.file_data || null // Keep for backward compatibility
        };

        // Display file - prefer Storage URL over base64
        let fileUrl = null;
        
        if (data.file_path) {
          // Use Supabase Storage public URL
          console.log('📦 Loading file from Storage:', data.file_path);
          const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(data.file_path);
          
          fileUrl = urlData.publicUrl;
          console.log('✅ Storage URL:', fileUrl);
        } else if (data.file_data) {
          // Fallback to base64 for old documents
          console.log('📦 Loading file from base64 (legacy)');
          try {
            let base64Data = data.file_data;
            
            if (typeof base64Data === 'object' && base64Data !== null) {
              if (Buffer.isBuffer(base64Data)) {
                base64Data = base64Data.toString('base64');
              } else if (base64Data.data) {
                base64Data = base64Data.data;
              }
            }
            
            if (typeof base64Data === 'string') {
              if (base64Data.includes(',')) {
                base64Data = base64Data.split(',')[1];
              }
              base64Data = base64Data.replace(/[\s\n\r\t]/g, '');
              fileUrl = `data:${docType};base64,${base64Data}`;
            }
          } catch (err) {
            console.error('Error processing base64:', err);
          }
        }
        
        if (fileUrl) {
          try {
            if (docType === 'application/pdf') {
              pdfViewer.src = fileUrl + '#toolbar=0&navpanes=0&scrollbar=0';
              pdfViewer.style.display = 'block';
              console.log('✅ PDF viewer loaded from:', fileUrl.substring(0, 50) + '...');
            } else if (docType.startsWith('image/')) {
              imageViewer.src = fileUrl;
              imageViewer.style.display = 'block';
              console.log('✅ Image viewer loaded from:', fileUrl.substring(0, 50) + '...');
            }
          } catch (err) {
            console.error('❌ Error setting viewer source:', err);
            viewerPlaceholder.textContent = 'Error loading file.';
            viewerPlaceholder.style.display = 'block';
          }
        } else {
          viewerPlaceholder.textContent = 'File content not available. You can still run analysis if you upload the file again.';
          viewerPlaceholder.style.display = 'block';
        }

        // Display analysis
        if (data.analysis_data) {
          displayAnalysis(data.analysis_data, docName);
          analyzeControls.style.display = 'none';
        } else {
          analysisMeta.textContent = '';
          analysisBody.className = 'analysis-body analysis-empty';
          analysisBody.textContent = 'No analysis available. Select a state and run analysis below.';
          analyzeControls.style.display = 'block';
        }
      } else {
        viewerPlaceholder.textContent = 'Could not load document.';
        viewerPlaceholder.style.display = 'block';
      }
    } catch (err) {
      console.error('Error loading document:', err);
      viewerPlaceholder.textContent = 'Error loading document.';
      viewerPlaceholder.style.display = 'block';
    }
  } else {
    viewerPlaceholder.textContent = 'Document data not available.';
    viewerPlaceholder.style.display = 'block';
  }
}

// Display analysis
function displayAnalysis(analysis, docName) {
  const analysisBody = document.getElementById('analysis-body');
  const analysisMeta = document.getElementById('analysis-meta');

  analysisMeta.textContent = `Analysis for ${section.toUpperCase()} · ${docName}`;
  analysisBody.classList.remove('analysis-empty', 'analysis-analyzing');

  const escapeHtml = (text) => {
    if (text == null) return "";
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  };

  const a = analysis;
  const strengths = Array.isArray(a.strengths) && a.strengths.length ? a.strengths : ["No clear strengths identified."];
  const issues = Array.isArray(a.issues) && a.issues.length ? a.issues : ["No major issues identified."];
  const recs = Array.isArray(a.recommendations) && a.recommendations.length ? a.recommendations : [];

  const fields = a.extractedFields || {};
  const principalAddress = escapeHtml(fields.principalAddress || "Not found");
  const agentAddress = escapeHtml(fields.agentAddress || "Not found");
  const principalName = escapeHtml(fields.principalName || "Not found");
  const agentNames = Array.isArray(fields.agentNames) && fields.agentNames.length ? fields.agentNames : ["Not found"];
  const successorAgents = Array.isArray(fields.successorAgents) ? fields.successorAgents : [];
  const stateJurisdiction = Array.isArray(fields.stateJurisdiction) && fields.stateJurisdiction.length ? fields.stateJurisdiction : ["Not found"];
  const executionDate = escapeHtml(fields.executionDate || "Not found");
  const notarizationDate = escapeHtml(fields.notarizationDate || "Not found");
  const signatureDetected = fields.signatureDetected === true ? "Yes" : "No";

  const summary = escapeHtml(a.summary || "No summary provided.");
  const overall = escapeHtml(a.overallAssessment || "No overall assessment provided.");
  const disclaimer = escapeHtml(a.disclaimer || "This is not legal advice. Please consult a licensed attorney in the relevant state.");

  analysisBody.innerHTML = `
    <div style="margin-bottom: 20px; padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
      <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #111827;">Extracted Information</h3>
      <div style="display: grid; gap: 12px;">
        <div><strong style="color: #111827;">Principal Name:</strong> <span style="color: #374151;">${principalName}</span></div>
        <div><strong style="color: #111827;">Principal Address:</strong> <span style="color: #374151;">${principalAddress}</span></div>
        <div><strong style="color: #111827;">Agent Name(s):</strong> <span style="color: #374151;">${agentNames.map(n => escapeHtml(n)).join(", ")}</span></div>
        <div><strong style="color: #111827;">Agent Address:</strong> <span style="color: #374151;">${agentAddress}</span></div>
        <div><strong style="color: #111827;">Successor Agent(s):</strong> <span style="color: #374151;">${successorAgents.length > 0 ? successorAgents.map(n => escapeHtml(n)).join(", ") : "None"}</span></div>
        <div><strong style="color: #111827;">State/Jurisdiction:</strong> <span style="color: #374151;">${stateJurisdiction.map(s => escapeHtml(s)).join(", ")}</span></div>
        <div><strong style="color: #111827;">Execution Date:</strong> <span style="color: #374151;">${executionDate}</span></div>
        <div><strong style="color: #111827;">Notarization Date:</strong> <span style="color: #374151;">${notarizationDate}</span></div>
        <div><strong style="color: #111827;">Signature Detected:</strong> <span style="color: #374151;">${signatureDetected}</span></div>
      </div>
    </div>
    <div style="margin-bottom: 12px; margin-top: 20px;"><strong style="color: #111827;">Summary:</strong> <span style="color: #374151;">${summary}</span></div>
    <div style="margin-bottom: 12px;"><strong style="color: #111827;">Overall Assessment:</strong> <span style="color: #374151;">${overall}</span></div>
    <div class="analysis-grid" style="margin-top: 12px;">
      <div class="analysis-block analysis-good">
        <div class="analysis-block-title" style="color: #166534; font-weight: 600; margin-bottom: 8px;">✓ What Looks Good</div>
        <ul class="analysis-list" style="color: #374151;">
          ${strengths.map((item) => `<li style="margin-bottom: 6px;">${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
      <div class="analysis-block analysis-issues">
        <div class="analysis-block-title" style="color: #991b1b; font-weight: 600; margin-bottom: 8px;">⚠ What May Need Fixing</div>
        <ul class="analysis-list" style="color: #374151;">
          ${issues.map((item) => `<li style="margin-bottom: 6px;">${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
    </div>
    ${recs.length ? `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb;"><strong style="color: #111827;">Recommendations:</strong>
         <ul class="analysis-list" style="color: #374151; margin-top: 8px;">
           ${recs.map((r) => `<li style="margin-bottom: 6px;">${escapeHtml(r)}</li>`).join("")}
         </ul>
       </div>` : ""}
    <div class="analysis-disclaimer" style="margin-top: 16px; padding-top: 12px; border-top: 1px dashed #d1d5db; color: #6b7280; font-size: 11px;">${disclaimer}</div>
  `;
}

// Run analysis
document.getElementById('run-analysis-btn').addEventListener('click', async function() {
  const stateSelect = document.getElementById('state-select');
  const selectedState = stateSelect.value;
  const analyzeBtn = this;
  const analysisBody = document.getElementById('analysis-body');
  const analysisMeta = document.getElementById('analysis-meta');

  if (!selectedState) {
    alert('Please select a state first');
    return;
  }

  if (!currentDocument) {
    alert('Document information not available');
    return;
  }

  if (!currentDocument.fileData) {
    const uploadFile = confirm('File content not available. Would you like to upload the file again to run analysis?');
    if (uploadFile) {
      window.location.href = 'index.html';
      return;
    }
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing...';
  analysisBody.className = 'analysis-body analysis-analyzing';
  analysisBody.innerHTML = 'Analyzing<span class="bouncing-dots"><span>.</span><span>.</span><span>.</span></span>';
  analysisMeta.textContent = '';

  try {
    let base64Data = currentDocument.fileData;
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }
    
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: currentDocument.type });
    const file = new File([blob], currentDocument.name, { type: currentDocument.type });

    const formData = new FormData();
    formData.append('state', selectedState);
    formData.append('file', file);

    const resp = await fetch('/api/analyze-poa', {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) {
      throw new Error('Analysis failed');
    }

    const data = await resp.json();
    let analysis = data.analysis;

    if (typeof analysis === 'string') {
      try {
        analysis = JSON.parse(analysis);
      } catch (e) {
        throw new Error('Invalid analysis format');
      }
    }

    displayAnalysis(analysis, currentDocument.name);

    if (supabase && currentDocument.id) {
      try {
        const { error } = await supabase
          .from('documents')
          .update({ analysis_data: analysis })
          .eq('id', currentDocument.id);

        if (error) {
          console.error('Error saving analysis:', error);
        } else {
          console.log('Analysis saved to Supabase');
          // Reload documents to update the analysis badge
          loadDocuments();
        }
      } catch (err) {
        console.error('Error saving analysis:', err);
      }
    }

    document.getElementById('analyze-controls').style.display = 'none';
  } catch (err) {
    console.error('Analysis error:', err);
    analysisBody.className = 'analysis-body analysis-empty';
    analysisBody.textContent = 'Error running analysis: ' + (err.message || 'Unknown error');
    analysisMeta.textContent = 'Analysis failed';
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Run Analysis';
  }
});

// Close viewer
document.getElementById('close-viewer-btn').addEventListener('click', function() {
  const viewerTitle = document.getElementById('viewer-title');
  const viewerPlaceholder = document.getElementById('viewer-placeholder');
  const pdfViewer = document.getElementById('pdf-viewer');
  const imageViewer = document.getElementById('image-viewer');
  const closeBtn = document.getElementById('close-viewer-btn');
  const analyzeControls = document.getElementById('analyze-controls');
  const documentsList = document.getElementById('documents-list');

  viewerTitle.textContent = 'Select a document to view';
  closeBtn.style.display = 'none';
  pdfViewer.src = '';
  imageViewer.src = '';
  pdfViewer.style.display = 'none';
  imageViewer.style.display = 'none';
  viewerPlaceholder.style.display = 'block';
  analyzeControls.style.display = 'none';
  documentsList.querySelectorAll('.document-item').forEach(item => item.classList.remove('active'));
  currentDocument = null;
});

// Back to main
document.getElementById('back-to-main-btn').addEventListener('click', function() {
  window.location.href = 'main.html';
});

// Add document button
document.getElementById('add-document-btn').addEventListener('click', function() {
  // Navigate to index.html with section parameter
  window.location.href = `index.html?section=${section}`;
});

// Helper functions
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Initialize
loadDocuments();


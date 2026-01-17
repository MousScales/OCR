// Use Firebase that was initialized in HTML
const db = window.firestore || null;
const storage = window.firebaseStorage || null;

if (!db || !storage) {
  console.error('❌ Firebase not available - documents will load from localStorage only');
}

// Get section from URL (needs to be available early)
const urlParams = new URLSearchParams(window.location.search);
const section = urlParams.get('section') || 'poa';

// Set proper section title
const sectionTitle = document.getElementById('section-title');
if (sectionTitle) {
  if (section === 'section2') {
    sectionTitle.textContent = 'Estate Documents';
  } else if (section === 'poa') {
    sectionTitle.textContent = 'POA';
  } else {
    sectionTitle.textContent = section.toUpperCase();
  }
}

// Initialize page - Firebase should already be loaded from HTML
function initializePage() {
  // Load documents
  loadDocuments();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  // DOM already loaded
  initializePage();
}

// Current document state
let currentDocument = null;

// Load documents
async function loadDocuments() {
  const documentsList = document.getElementById('documents-list');
  if (!documentsList) {
    console.error('❌ documents-list element not found');
    return;
  }
  
  documentsList.innerHTML = '<div class="empty-state">Loading documents...</div>';

  let documents = [];
  
  // Use Firebase Firestore from window (initialized in HTML)
  const firestore = window.firestore || db;
  
  if (firestore) {
    try {
      console.log(`📥 Loading documents from Firebase for section: ${section}`);
      const snapshot = await firestore
        .collection('documents')
        .where('section', '==', section)
        .orderBy('created_at', 'desc')
        .get();

      if (snapshot.empty) {
        console.log('📭 No documents found in Firebase');
        documents = JSON.parse(localStorage.getItem(`${section}_documents`) || '[]');
        console.log('📦 Loaded', documents.length, 'documents from localStorage (fallback)');
      } else {
        console.log('✅ Loaded', snapshot.size, 'documents from Firebase');
        documents = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            type: data.type,
            size: data.size,
            date: data.created_at?.toDate ? data.created_at.toDate().toISOString() : data.created_at,
            hasAnalysis: !!data.analysis_data,
            file_path: data.file_path || null
          };
        });
        // Sync to localStorage as backup
        localStorage.setItem(`${section}_documents`, JSON.stringify(documents));
        console.log('💾 Synced', documents.length, 'documents to localStorage');
      }
    } catch (err) {
      console.error('❌ Error loading documents from Firebase:', err);
      documents = JSON.parse(localStorage.getItem(`${section}_documents`) || '[]');
      console.log('📦 Loaded', documents.length, 'documents from localStorage (fallback)');
    }
  } else {
    console.warn('⚠️ Firebase not available, loading from localStorage');
    documents = JSON.parse(localStorage.getItem(`${section}_documents`) || '[]');
    console.log('📦 Loaded', documents.length, 'documents from localStorage');
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

  // Add click handlers for document items
  documentsList.querySelectorAll('.document-item').forEach(item => {
    item.addEventListener('click', function(e) {
      // Don't trigger if clicking the delete button
      if (e.target.classList.contains('delete-document-btn')) {
        return;
      }
      
      documentsList.querySelectorAll('.document-item').forEach(i => i.classList.remove('active'));
      this.classList.add('active');
      
      const docId = this.getAttribute('data-doc-id');
      const docName = this.getAttribute('data-doc-name');
      const docType = this.getAttribute('data-doc-type');
      
      loadDocument(docId, docName, docType);
    });
  });

  // Add click handlers for delete buttons
  documentsList.querySelectorAll('.delete-document-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent triggering document item click
      
      const docId = this.getAttribute('data-doc-id');
      const filePath = this.getAttribute('data-doc-path');
      
      console.log('🗑️ Delete button clicked:', { docId, filePath });
      
      if (docId) {
        deleteDocument(docId, filePath);
      } else {
        console.error('❌ Document ID not found');
        alert('Document ID not found. Cannot delete.');
      }
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

  const firestore = window.firestore || db;
  const firebaseStorage = window.firebaseStorage || storage;
  
  if (firestore && docId) {
    try {
      const docRef = firestore.collection('documents').doc(docId);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const data = docSnap.data();
        currentDocument = {
          id: docId,
          name: docName,
          type: docType,
          filePath: data.file_path || null,
          fileData: data.file_data || null // Keep for backward compatibility
        };

        // Display file - prefer Storage URL over base64
        let fileUrl = null;
        
        if (data.file_path && firebaseStorage) {
          // Use Firebase Storage public URL
          console.log('📦 Loading file from Firebase Storage:', data.file_path);
          const storageRef = firebaseStorage.ref(data.file_path);
          fileUrl = await storageRef.getDownloadURL();
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
          // Show download button
          const downloadBtn = document.getElementById('download-pdf-btn');
          if (downloadBtn) {
            downloadBtn.style.display = 'block';
            downloadBtn.onclick = () => downloadDocumentWithAnalysis(docId, docName, docType, data.analysis_data, fileUrl);
          }
        } else {
          analysisMeta.textContent = '';
          analysisBody.className = 'analysis-body analysis-empty';
          const docTypeLabel = section === 'section2' ? 'estate document' : 'POA';
          analysisBody.textContent = `No ${docTypeLabel} analysis available. Select a state and run analysis below.`;
          analyzeControls.style.display = 'block';
          // Hide download button
          const downloadBtn = document.getElementById('download-pdf-btn');
          if (downloadBtn) {
            downloadBtn.style.display = 'none';
          }
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

  // Set proper analysis meta text based on section
  const sectionLabel = section === 'section2' ? 'Estate Document' : (section === 'poa' ? 'POA' : section.toUpperCase());
  analysisMeta.textContent = `Analysis for ${sectionLabel} · ${docName}`;
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
  const summary = escapeHtml(a.summary || "No summary provided.");
  const overall = escapeHtml(a.overallAssessment || "No overall assessment provided.");
  const disclaimer = escapeHtml(a.disclaimer || "This is not legal advice. Please consult a licensed attorney in the relevant state.");

  // Check if this is an estate document (section2) or POA document
  const isEstateDocument = section === 'section2';
  
  let extractedFieldsHtml = '';
  
  if (isEstateDocument) {
    // Estate document fields
    const documentType = escapeHtml(fields.documentType || "Not found");
    const estateName = escapeHtml(fields.estateName || "Not found");
    const decedentName = escapeHtml(fields.decedentName || "Not found");
    const representativeNames = Array.isArray(fields.representativeNames) && fields.representativeNames.length ? fields.representativeNames : ["Not found"];
    const typeOfAdministration = escapeHtml(fields.typeOfAdministration || "Not found");
    const administrationLimitations = escapeHtml(fields.administrationLimitations || "None");
    const requiresCourtApproval = fields.requiresCourtApproval === true ? "Yes" : (fields.requiresCourtApproval === false ? "No" : "Not specified");
    const state = escapeHtml(fields.state || "Not found");
    const courtName = escapeHtml(fields.courtName || "Not found");
    const judgeName = escapeHtml(fields.judgeName || "Not found");
    const judgeSignatureDetected = fields.judgeSignatureDetected === true ? "Yes" : "No";
    const effectiveDate = escapeHtml(fields.effectiveDate || "Not found");
    const judgeSignatureDate = escapeHtml(fields.judgeSignatureDate || "Not found");
    const stampOrSealDetected = fields.stampOrSealDetected === true ? "Yes" : "No";
    const expirationDate = escapeHtml(fields.expirationDate || "Not specified");
    const terminationClauses = Array.isArray(fields.terminationClauses) ? fields.terminationClauses : [];
    const pageCount = escapeHtml(fields.pageCount || "Not found");
    const completenessCheck = escapeHtml(fields.completenessCheck || "Not verified");

    extractedFieldsHtml = `
      <div style="margin-bottom: 20px; padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
        <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #111827;">Extracted Information</h3>
        <div style="display: grid; gap: 12px;">
          <div><strong style="color: #111827;">Document Type:</strong> <span style="color: #374151;">${documentType}</span></div>
          <div><strong style="color: #111827;">Estate Name:</strong> <span style="color: #374151;">${estateName}</span></div>
          <div><strong style="color: #111827;">Decedent Name:</strong> <span style="color: #374151;">${decedentName}</span></div>
          <div><strong style="color: #111827;">Representative Name(s):</strong> <span style="color: #374151;">${representativeNames.map(n => escapeHtml(n)).join(", ")}</span></div>
          <div><strong style="color: #111827;">Type of Administration:</strong> <span style="color: #374151;">${typeOfAdministration}</span></div>
          <div><strong style="color: #111827;">Administration Limitations:</strong> <span style="color: #374151;">${administrationLimitations}</span></div>
          <div><strong style="color: #111827;">Requires Court Approval:</strong> <span style="color: #374151;">${requiresCourtApproval}</span></div>
          <div><strong style="color: #111827;">State:</strong> <span style="color: #374151;">${state}</span></div>
          <div><strong style="color: #111827;">Court Name:</strong> <span style="color: #374151;">${courtName}</span></div>
          <div><strong style="color: #111827;">Judge Name:</strong> <span style="color: #374151;">${judgeName}</span></div>
          <div><strong style="color: #111827;">Judge Signature Detected:</strong> <span style="color: #374151;">${judgeSignatureDetected}</span></div>
          <div><strong style="color: #111827;">Effective Date:</strong> <span style="color: #374151;">${effectiveDate}</span></div>
          <div><strong style="color: #111827;">Judge Signature Date:</strong> <span style="color: #374151;">${judgeSignatureDate}</span></div>
          <div><strong style="color: #111827;">Stamp or Seal Detected:</strong> <span style="color: #374151;">${stampOrSealDetected}</span></div>
          <div><strong style="color: #111827;">Expiration Date:</strong> <span style="color: #374151;">${expirationDate}</span></div>
          <div><strong style="color: #111827;">Termination Clauses:</strong> <span style="color: #374151;">${terminationClauses.length > 0 ? terminationClauses.map(c => escapeHtml(c)).join(", ") : "None"}</span></div>
          <div><strong style="color: #111827;">Page Count:</strong> <span style="color: #374151;">${pageCount}</span></div>
          <div><strong style="color: #111827;">Completeness Check:</strong> <span style="color: #374151;">${completenessCheck}</span></div>
        </div>
      </div>
    `;
  } else {
    // POA document fields
    const principalAddress = escapeHtml(fields.principalAddress || "Not found");
    const agentAddress = escapeHtml(fields.agentAddress || "Not found");
    const principalName = escapeHtml(fields.principalName || "Not found");
    const agentNames = Array.isArray(fields.agentNames) && fields.agentNames.length ? fields.agentNames : ["Not found"];
    const successorAgents = Array.isArray(fields.successorAgents) ? fields.successorAgents : [];
    const stateJurisdiction = Array.isArray(fields.stateJurisdiction) && fields.stateJurisdiction.length ? fields.stateJurisdiction : ["Not found"];
    const executionDate = escapeHtml(fields.executionDate || "Not found");
    const notarizationDate = escapeHtml(fields.notarizationDate || "Not found");
    const signatureDetected = fields.signatureDetected === true ? "Yes" : "No";

    extractedFieldsHtml = `
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
    `;
  }

  analysisBody.innerHTML = `
    ${extractedFieldsHtml}
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

  // State is now optional - proceed without it if not selected

  if (!currentDocument) {
    alert('Document information not available');
    return;
  }

  if (!currentDocument.fileData) {
    const docTypeLabel = section === 'section2' ? 'estate document' : 'POA';
    const uploadFile = confirm(`File content not available. Would you like to upload the ${docTypeLabel} file again to run analysis?`);
    if (uploadFile) {
      window.location.href = 'index.html';
      return;
    }
    return;
  }

  analyzeBtn.disabled = true;
  const docTypeLabel = section === 'section2' ? 'Estate Document' : 'POA';
  analyzeBtn.textContent = 'Analyzing...';
  analysisBody.className = 'analysis-body analysis-analyzing';
  analysisBody.innerHTML = `Analyzing ${docTypeLabel}<span class="bouncing-dots"><span>.</span><span>.</span><span>.</span></span>`;
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
    // State is optional - send empty string if not selected
    formData.append('state', selectedState || "");
    formData.append('file', file);

    // Use estate endpoint for section2, POA endpoint for poa section
    const apiEndpoint = section === 'section2' ? '/api/analyze-estate' : '/api/analyze-poa';
    const docTypeLabel = section === 'section2' ? 'estate document' : 'POA';
    console.log(`🔬 Starting ${docTypeLabel} analysis...`);
    console.log(`📍 API endpoint: ${apiEndpoint}`);
    const resp = await fetch(apiEndpoint, {
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
    // Show download button after analysis
    const downloadBtn = document.getElementById('download-pdf-btn');
    if (downloadBtn && currentDocument) {
      downloadBtn.style.display = 'block';
      // Get file URL for download
      const pdfViewer = document.getElementById('pdf-viewer');
      const imageViewer = document.getElementById('image-viewer');
      let fileUrl = null;
      if (pdfViewer && pdfViewer.style.display !== 'none' && pdfViewer.src) {
        fileUrl = pdfViewer.src.split('#')[0]; // Remove hash
      } else if (imageViewer && imageViewer.style.display !== 'none' && imageViewer.src) {
        fileUrl = imageViewer.src;
      }
      downloadBtn.onclick = () => downloadDocumentWithAnalysis(currentDocument.id, currentDocument.name, currentDocument.type, analysis, fileUrl);
    }

    if (firestore && currentDocument.id) {
      try {
        const docRef = firestore.collection('documents').doc(currentDocument.id);
        await docRef.update({ 
          analysis_data: analysis,
          updated_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('Analysis saved to Firebase');
        // Reload documents to update the analysis badge
        loadDocuments();
      } catch (err) {
        console.error('Error saving analysis:', err);
      }
    }

    document.getElementById('analyze-controls').style.display = 'none';
  } catch (err) {
    console.error('Analysis error:', err);
    analysisBody.className = 'analysis-body analysis-empty';
    const docTypeLabel = section === 'section2' ? 'estate document' : 'POA';
    analysisBody.textContent = `Error running ${docTypeLabel} analysis: ` + (err.message || 'Unknown error');
    analysisMeta.textContent = 'Analysis failed';
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Run Analysis';
  }
});

// Delete document
async function deleteDocument(docId, filePath) {
  console.log('🗑️ deleteDocument called:', { docId, filePath });
  
  if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
    console.log('❌ User cancelled deletion');
    return;
  }

  const firestore = window.firestore || db;
  const firebaseStorage = window.firebaseStorage || storage;
  
  if (firestore) {
    console.log('✅ Firebase available, proceeding with deletion');
    try {
      // Delete from Firebase Storage
      if (filePath && firebaseStorage) {
        const storageRef = firebaseStorage.ref(filePath);
        try {
          await storageRef.delete();
          console.log('File deleted from Firebase Storage:', filePath);
        } catch (storageError) {
          console.error('Error deleting file from Firebase Storage:', storageError);
          // Continue with database deletion even if storage fails
        }
      }

      // Delete from Firestore database
      await firestore.collection('documents').doc(docId).delete();
      console.log('Document deleted from Firestore:', docId);

      // Remove from local storage and refresh list
      const currentSection = urlParams.get('section') || 'poa';
      let localDocs = JSON.parse(localStorage.getItem(`${currentSection}_documents`) || '[]');
      localDocs = localDocs.filter(doc => doc.id !== docId);
      localStorage.setItem(`${currentSection}_documents`, JSON.stringify(localDocs));

      // If the deleted document was being viewed, close the viewer
      if (currentDocument && currentDocument.id === docId) {
        closeViewer();
      }

      // Reload the document list
      loadDocuments();
    } catch (err) {
      console.error('Error during document deletion:', err);
      alert('An unexpected error occurred during deletion: ' + err.message);
    }
  } else {
    // Fallback to localStorage only
    const currentSection = urlParams.get('section') || 'poa';
    let localDocs = JSON.parse(localStorage.getItem(`${currentSection}_documents`) || '[]');
    localDocs = localDocs.filter(doc => doc.id !== docId);
    localStorage.setItem(`${currentSection}_documents`, JSON.stringify(localDocs));
    
    // If the deleted document was being viewed, close the viewer
    if (currentDocument && currentDocument.id === docId) {
      closeViewer();
    }
    
    loadDocuments();
  }
}

// Close viewer
function closeViewer() {
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
}

document.getElementById('close-viewer-btn').addEventListener('click', function() {
  closeViewer();
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

// Delete all documents
async function deleteAllDocuments() {
  const currentSection = urlParams.get('section') || 'poa';
  const sectionLabel = currentSection === 'section2' ? 'Estate Documents' : 'POA';
  
  if (!confirm(`Are you sure you want to delete ALL ${sectionLabel} documents? This action cannot be undone.`)) {
    console.log('❌ User cancelled delete all');
    return;
  }

  if (!confirm('This will permanently delete all documents. Are you absolutely sure?')) {
    console.log('❌ User cancelled delete all (second confirmation)');
    return;
  }

  const documentsList = document.getElementById('documents-list');
  documentsList.innerHTML = '<div class="empty-state">Deleting all documents...</div>';

  if (firestore) {
    try {
      console.log('🗑️ Deleting all documents from Firebase...');
      
      // Get all documents for this section
      const snapshot = await firestore
        .collection('documents')
        .where('section', '==', currentSection)
        .get();

      if (snapshot.empty) {
        console.log('No documents to delete');
        // Clear localStorage anyway
        localStorage.removeItem(`${currentSection}_documents`);
        loadDocuments();
        return;
      }

      const documents = snapshot.docs.map(doc => ({
        id: doc.id,
        file_path: doc.data().file_path
      }));

      console.log(`Found ${documents.length} documents to delete`);

      // Delete all files from Storage
      const firebaseStorage = window.firebaseStorage || storage;
      if (firebaseStorage) {
        const filePaths = documents
          .map(doc => doc.file_path)
          .filter(path => path); // Remove null/undefined paths
        
        if (filePaths.length > 0) {
          console.log('Deleting files from Storage:', filePaths);
          const deletePromises = filePaths.map(path => {
            const storageRef = firebaseStorage.ref(path);
            return storageRef.delete().catch(err => {
              console.error(`Error deleting file ${path}:`, err);
              return null; // Continue even if one fails
            });
          });
          await Promise.all(deletePromises);
          console.log('✅ All files deleted from Storage');
        }
      }

      // Delete all documents from Firestore
      const batch = firestore.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      console.log(`✅ Deleted ${documents.length} documents from Firestore`);

      // Clear localStorage
      localStorage.removeItem(`${currentSection}_documents`);

      // Close viewer if open
      closeViewer();

      // Reload the document list
      loadDocuments();
      
      alert(`Successfully deleted all ${documents.length} documents.`);
    } catch (err) {
      console.error('Error during delete all:', err);
      alert('An unexpected error occurred: ' + err.message);
      loadDocuments();
    }
  } else {
    // Fallback to localStorage only
    const localDocs = JSON.parse(localStorage.getItem(`${currentSection}_documents`) || '[]');
    localStorage.removeItem(`${currentSection}_documents`);
    closeViewer();
    loadDocuments();
    alert(`Deleted ${localDocs.length} documents from local storage.`);
  }
}

// Add event listener for delete all button
const deleteAllBtn = document.getElementById('delete-all-btn');
if (deleteAllBtn) {
  deleteAllBtn.addEventListener('click', deleteAllDocuments);
}

// Download document and analysis as combined PDF
async function downloadDocumentWithAnalysis(docId, docName, docType, analysisData, fileUrl) {
  try {
    const downloadBtn = document.getElementById('download-pdf-btn');
    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.textContent = '⏳ Generating PDF...';
    }

    // Get the original document file
    let originalPdfBytes = null;
    let isImage = false;
    let imageData = null;

    if (fileUrl) {
      if (docType === 'application/pdf') {
        // Fetch PDF file
        const response = await fetch(fileUrl);
        originalPdfBytes = await response.arrayBuffer();
      } else if (docType.startsWith('image/')) {
        // Fetch image file
        isImage = true;
        const response = await fetch(fileUrl);
        imageData = await response.blob();
      }
    }

    // If we don't have fileUrl, try to get from Firebase
    if (!originalPdfBytes && !imageData) {
      const firestore = window.firestore || db;
      const firebaseStorage = window.firebaseStorage || storage;
      if (firestore && docId) {
        const docRef = firestore.collection('documents').doc(docId);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
          const data = docSnap.data();
          if (data.file_path && firebaseStorage) {
            const storageRef = firebaseStorage.ref(data.file_path);
            const url = await storageRef.getDownloadURL();
            const response = await fetch(url);
            if (docType === 'application/pdf') {
              originalPdfBytes = await response.arrayBuffer();
            } else {
              isImage = true;
              imageData = await response.blob();
            }
          } else if (data.file_data) {
            // Handle base64 data
            let base64Data = data.file_data;
            if (typeof base64Data === 'object' && base64Data !== null) {
              if (base64Data.data) {
                base64Data = base64Data.data;
              }
            }
            if (typeof base64Data === 'string') {
              if (base64Data.includes(',')) {
                base64Data = base64Data.split(',')[1];
              }
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              if (docType === 'application/pdf') {
                originalPdfBytes = bytes.buffer;
              } else {
                isImage = true;
                imageData = new Blob([bytes], { type: docType });
              }
            }
          }
        }
      }
    }

    // Create analysis PDF using jsPDF
    const { jsPDF } = window.jspdf;
    const analysisPdf = new jsPDF('p', 'mm', 'a4');
    
    // Get analysis HTML content
    const analysisBody = document.getElementById('analysis-body');
    const analysisMeta = document.getElementById('analysis-meta');
    
    // Create a temporary container for better PDF rendering
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.width = '210mm'; // A4 width
    tempContainer.style.padding = '20mm';
    tempContainer.style.backgroundColor = 'white';
    tempContainer.style.fontFamily = 'Arial, sans-serif';
    tempContainer.style.fontSize = '12px';
    tempContainer.style.color = '#000';
    
    // Clone analysis content
    const analysisClone = analysisBody.cloneNode(true);
    analysisClone.style.width = '100%';
    analysisClone.style.padding = '0';
    analysisClone.style.margin = '0';
    
    // Add title
    const title = document.createElement('h1');
    title.textContent = analysisMeta.textContent || 'Document Analysis';
    title.style.fontSize = '18px';
    title.style.marginBottom = '15px';
    title.style.color = '#111827';
    tempContainer.appendChild(title);
    tempContainer.appendChild(analysisClone);
    document.body.appendChild(tempContainer);

    // Convert to canvas and add to PDF
    const canvas = await html2canvas(tempContainer, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    analysisPdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      analysisPdf.addPage();
      analysisPdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Clean up
    document.body.removeChild(tempContainer);

    const analysisPdfBytes = analysisPdf.output('arraybuffer');

    // Merge PDFs using pdf-lib
    const { PDFDocument } = PDFLib;
    const mergedPdf = await PDFDocument.create();

    // Add original document (first page)
    if (originalPdfBytes) {
      const originalPdf = await PDFDocument.load(originalPdfBytes);
      const pages = await mergedPdf.copyPages(originalPdf, originalPdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    } else if (isImage && imageData) {
      // Convert image to PDF page
      const imageBytes = await imageData.arrayBuffer();
      let image;
      if (docType.includes('png')) {
        image = await mergedPdf.embedPng(imageBytes);
      } else {
        image = await mergedPdf.embedJpg(imageBytes);
      }
      const page = mergedPdf.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }

    // Add analysis PDF (second page)
    const analysisPdfDoc = await PDFDocument.load(analysisPdfBytes);
    const analysisPages = await mergedPdf.copyPages(analysisPdfDoc, analysisPdfDoc.getPageIndices());
    analysisPages.forEach((page) => mergedPdf.addPage(page));

    // Generate and download
    const mergedPdfBytes = await mergedPdf.save();
    const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${docName.replace(/\.[^/.]+$/, '')}_with_analysis.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = '📥 Download PDF';
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Error generating PDF: ' + error.message);
    const downloadBtn = document.getElementById('download-pdf-btn');
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = '📥 Download PDF';
    }
  }
}

// Initialize
loadDocuments();


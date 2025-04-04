// src/App.jsx
import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker (ensure pdf.worker.min.mjs is in your public folder)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('/pdf.worker.min.mjs', import.meta.url).toString();

/**
 * Extract structured data from Page 1 text.
 * Expected format: "Integer Str Integer Integer Str"
 * Example: "60 Y12 3550 60 CL1"
 * Returns an array of objects with:
 *   - required: the first integer (e.g., 60),
 *   - diameter: the second token (e.g., Y12),
 *   - mark: the fifth token (e.g., CL1)
 */
function extractPage1Data(text) {
  // Updated regex: last group matches one to three uppercase letters followed by digits.
  const pattern = /\b(\d+)\s+([A-Z]\d+)\s+\d+\s+\d+\s+([A-Z]{1,3}\d+)\b/g;
  let match;
  const data = [];
  while ((match = pattern.exec(text)) !== null) {
    data.push({
      required: parseInt(match[1], 10),
      diameter: match[2],
      mark: match[3],
    });
  }
  return data;
}

/**
 * Extract structured data from Page 2+ text.
 * Expected format: "Integer<letter><digits>-<mark>(-Integer)?"
 * Examples:
 *   "16Y12-A1-200" or "15R10-CL1-600" or "13R10-CL1-600"
 * Returns an array of objects with:
 *   - count: the integer before the diameter (e.g., 15),
 *   - diameter: the letter/digits part (e.g., R10 or Y12),
 *   - mark: the bar mark (e.g., CL1 or A1)
 */
function extractPage2Data(text) {
  // Updated regex: Allow any uppercase letter for the diameter group.
  // The trailing "-Integer" is optional.
  const pattern = /\b(\d+)([A-Z]\d+)-([A-Z]{1,3}\d+)(?:-\d+)?\b/g;
  let match;
  const data = [];
  while ((match = pattern.exec(text)) !== null) {
    data.push({
      count: parseInt(match[1], 10),
      diameter: match[2],
      mark: match[3],
    });
  }
  return data;
}

function App() {
  // States for file uploads.
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  // States for extracted text.
  const [text1, setText1] = useState('');
  const [text2, setText2] = useState('');
  // Comparison results (table rows).
  const [results, setResults] = useState([]);
  // Option: if pages show both section and layout, tally from Page 2+ should be halved.
  const [sectionAndLayout, setSectionAndLayout] = useState(false);
  // State for rows that the user chooses to ignore.
  // Keys are bar marks; value true means "ignored".
  const [ignoredRows, setIgnoredRows] = useState({});

  // Handle file upload & extract text from all pages using pdfjs-dist.
  const handleUpload = async (file, setText) => {
    if (!file) return;
    const fileURL = URL.createObjectURL(file);
    try {
      const pdf = await pdfjsLib.getDocument(fileURL).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const textItems = content.items.map(item => item.str);
        fullText += textItems.join(' ') + '\n';
      }
      setText(fullText);
    } catch (error) {
      console.error("Error extracting PDF text:", error);
      setText('');
    }
  };

  // Handle comparison: parse data from both PDFs, group and tally Page 2+ data, and build table rows.
  const handleCompare = () => {
    const page1Data = extractPage1Data(text1);
    const page2Data = extractPage2Data(text2);

    // Group Page 2 data by bar mark and sum counts.
    const page2Grouped = {};
    page2Data.forEach(item => {
      const key = item.mark;
      if (!page2Grouped[key]) {
        page2Grouped[key] = { total: 0, diameter: item.diameter };
      }
      page2Grouped[key].total += item.count;
    });

    // Build table rows using Page 1 data.
    const tableData = page1Data.map(item => {
      const page2Entry = page2Grouped[item.mark];
      let tally = page2Entry ? page2Grouped[item.mark].total : 0;
      if (sectionAndLayout) {
        tally = Math.round(tally / 2);
      }
      const diff = tally - item.required;
      const diameterMatch = page2Entry ? (page2Entry.diameter === item.diameter) : false;
      return {
        mark: item.mark,
        required: item.required,
        requiredDiameter: item.diameter,
        tally,
        extractedDiameter: page2Entry ? page2Entry.diameter : 'N/A',
        diff,
        diameterMatch,
      };
    });

    // Sort table data alphabetically by bar mark.
    tableData.sort((a, b) => a.mark.localeCompare(b.mark));
    setResults(tableData);
  };

  // Toggle "Ignore" for a specific bar mark.
  const toggleIgnore = (mark) => {
    setIgnoredRows(prev => ({ ...prev, [mark]: !prev[mark] }));
  };

  // Compute mismatched bar marks for display in the text box.
  // A row is mismatched if its difference is nonzero or if the diameter doesn't match, and it's not ignored.
  const mismatchedBars = results
    .filter(row => ((row.diff !== 0) || (!row.diameterMatch)) && !ignoredRows[row.mark])
    .map(row => row.mark)
    .join('\n');

  return (
    <div style={{ background: '#1e1e1e', color: '#f0f0f0', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem', fontFamily: 'Arial' }}>
        <h1>🛠 BS PDF Comparison App</h1>

        {/* File Uploads */}
        <div style={{ marginBottom: '1rem' }}>
          <label>
            📄 Upload Page 1 PDF:
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const file = e.target.files[0];
                setFile1(file);
                handleUpload(file, setText1);
              }}
            />
          </label>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>
            📄 Upload Page 2+ PDF:
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const file = e.target.files[0];
                setFile2(file);
                handleUpload(file, setText2);
              }}
            />
          </label>
        </div>

        {/* Section and Layout Option */}
        <div style={{ marginBottom: '1rem' }}>
          <label>
            <input
              type="checkbox"
              checked={sectionAndLayout}
              onChange={(e) => setSectionAndLayout(e.target.checked)}
            />
            {' '}Section and Layout (halve tally from Page 2+)
          </label>
        </div>

        {/* Compare Button */}
        <button
          onClick={handleCompare}
          style={{
            padding: '0.5rem 1.5rem',
            margin: '1rem 0',
            fontSize: '1rem',
            background: '#444',
            color: '#fff',
            border: '1px solid #777',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
          disabled={!text1 || !text2}
        >
          🔍 Compare
        </button>

        {/* Comparison Results Table */}
        <h2>Comparison Results</h2>
        {results.length > 0 ? (
          <table style={{ width: '85%', margin: 'auto', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #777', padding: '0.5rem' }}>Bar Mark</th>
                <th style={{ border: '1px solid #777', padding: '0.5rem' }}>Required Qty</th>
                <th style={{ border: '1px solid #777', padding: '0.5rem' }}>Diameter (Req)</th>
                <th style={{ border: '1px solid #777', padding: '0.5rem' }}>Tally (Page 2+)</th>
                <th style={{ border: '1px solid #777', padding: '0.5rem' }}>Diameter (Extracted)</th>
                <th style={{ border: '1px solid #777', padding: '0.5rem' }}>Difference</th>
                <th style={{ border: '1px solid #777', padding: '0.5rem' }}>Diameter Match?</th>
                <th style={{ border: '1px solid #777', padding: '0.5rem' }}>Ignore</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, index) => {
                const ignore = ignoredRows[row.mark];
                // Highlight cells if there's a mismatch and the row isn't ignored.
                const tallyStyle = (row.diff !== 0 && !ignore) ? { backgroundColor: 'red' } : {};
                const extractedDiameterStyle = (!row.diameterMatch && !ignore) ? { backgroundColor: 'red' } : {};
                return (
                  <tr key={index} style={{ textAlign: 'center' }}>
                    <td style={{ border: '1px solid #777', padding: '0.5rem' }}>{row.mark}</td>
                    <td style={{ border: '1px solid #777', padding: '0.5rem' }}>{row.required}</td>
                    <td style={{ border: '1px solid #777', padding: '0.5rem' }}>{row.requiredDiameter}</td>
                    <td style={{ border: '1px solid #777', padding: '0.5rem', ...tallyStyle }}>{row.tally}</td>
                    <td style={{ border: '1px solid #777', padding: '0.5rem', ...extractedDiameterStyle }}>{row.extractedDiameter}</td>
                    <td style={{ border: '1px solid #777', padding: '0.5rem', ...tallyStyle }}>{row.diff}</td>
                    <td style={{ border: '1px solid #777', padding: '0.5rem', ...extractedDiameterStyle }}>
                      {row.diameterMatch ? 'Yes' : 'No'}
                    </td>
                    <td style={{ border: '1px solid #777', padding: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={ignore || false}
                        onChange={() => toggleIgnore(row.mark)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ textAlign: 'center' }}>No comparison results yet. Please upload PDFs and click Compare.</p>
        )}

        {/* Mismatched Bar Marks Text Box */}
        <h2 style={{ marginTop: '2rem' }}>Mismatched Bar Marks</h2>
        <div style={{ 
            width: '85%', 
            margin: 'auto', 
            background: '#333', 
            padding: '1rem', 
            whiteSpace: 'pre-wrap', 
            border: '1px solid #777'
          }}>
          {mismatchedBars || "None"}
        </div>
      </div>
    </div>
  );
}

export default App;

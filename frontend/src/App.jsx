import React, { useState } from "react";
import axios from "axios";

// --- SQL DATA TYPES (PRESETS) ---
// These populate the dropdown. Selecting one fills the text box.
const SQL_DATA_TYPES = {
    "String / Text": [
        "NVARCHAR(MAX)", "VARCHAR(MAX)", "NVARCHAR(255)", "VARCHAR(255)", "NCHAR(10)", "CHAR(10)", "TEXT"
    ],
    "Integers": [
        "INT", "BIGINT", "SMALLINT", "TINYINT"
    ],
    "Decimals / Money": [
        "FLOAT", "REAL", "DECIMAL(18,2)", "DECIMAL(38,4)", "MONEY"
    ],
    "Date & Time": [
        "DATETIME", "DATETIME2", "DATE", "TIME"
    ],
    "Other": [
        "BIT", "UNIQUEIDENTIFIER", "VARBINARY(MAX)"
    ]
};

// --- STYLES ---
const styles = {
  mainWrapper: {
    minHeight: "100vh", backgroundColor: "#f4f7f6", fontFamily: "Segoe UI, sans-serif",
    display: "flex", justifyContent: "center", padding: "40px 20px"
  },
  container: {
    width: "100%", maxWidth: "1300px", display: "flex", flexDirection: "column"
  },
  tableWrapper: {
    width: "100%", overflowX: "auto", border: "1px solid #ddd", 
    maxHeight: "500px", backgroundColor: "white", borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
  },
  thDefault: {
    padding: "12px", textAlign: "left", whiteSpace: "nowrap", borderBottom: "2px solid #ddd",
    background: "#f1f3f5", color: "#333", cursor: "pointer", transition: "all 0.2s",
    userSelect: "none", borderRight: "1px solid #ddd"
  },
  thSelected: {
    padding: "12px", textAlign: "left", whiteSpace: "nowrap", borderBottom: "2px solid #0056b3",
    background: "#007bff", color: "white", cursor: "pointer", transition: "all 0.2s",
    userSelect: "none", borderRight: "1px solid #0056b3"
  },
  summaryBox: {
    background: "#e3f2fd", padding: "20px", borderRadius: "8px", border: "1px solid #90caf9",
    marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px"
  },
  tag: {
    background: "#007bff", color: "white", padding: "5px 10px", borderRadius: "15px",
    fontSize: "13px", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "8px"
  },
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(255,255,255,0.9)", zIndex: 1000,
    display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center"
  },
  modalBackdrop: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", zIndex: 2000,
    display: "flex", justifyContent: "center", alignItems: "center"
  },
  modalContent: {
    background: "white", padding: "25px", borderRadius: "8px", width: "650px", // Wider modal
    maxHeight: "85vh", overflowY: "auto", boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
  }
};

function App() {
  const [file, setFile] = useState(null);
  const [originalHeaders, setOriginalHeaders] = useState([]); 
  const [selectedColumns, setSelectedColumns] = useState([]); 
  const [preview, setPreview] = useState([]);
  const [serverFilename, setServerFilename] = useState(""); 
  const [columnTypes, setColumnTypes] = useState({}); 
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isIndeterminate, setIsIndeterminate] = useState(false); 
  const [tableName, setTableName] = useState("");

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setPreview([]); setServerFilename(""); setColumnTypes({});
    setOriginalHeaders([]); setSelectedColumns([]);
  };

  const handleUpload = async () => {
    if (!file) return alert("Please select a file");
    const formData = new FormData();
    formData.append("file", file);

    setLoading(true); setLoadingMessage("Uploading...");
    setUploadProgress(0); setIsIndeterminate(false);

    try {
      const response = await axios.post("http://localhost:5000/upload", formData, {
        onUploadProgress: (p) => {
          const percent = Math.round((p.loaded * 100) / p.total);
          setUploadProgress(percent);
          if (percent === 100) { setLoadingMessage("Processing Preview..."); setIsIndeterminate(true); }
        },
      });
      const headers = response.data.headers || [];
      setOriginalHeaders(headers);
      setPreview(response.data.preview || []);
      setServerFilename(response.data.filename); 
      setSelectedColumns([]); 
    } catch (error) {
      alert(error.response?.data?.error || "Error uploading file.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDB = async () => {
    if (!tableName) return alert("Enter Table Name");
    if (selectedColumns.length === 0) return alert("Select at least one column.");
    
    setLoading(true); setLoadingMessage("Saving to Databse...");
    setIsIndeterminate(true); 

    try {
      await axios.post("http://localhost:5000/save", {
        tableName, selectedColumns, filename: serverFilename, columnTypes
      });
      alert("Success! Table Created: " + tableName);
      setTableName(""); setServerFilename(""); setPreview([]);
      setOriginalHeaders([]); setColumnTypes({}); setSelectedColumns([]);
    } catch (error) {
      if (error.response?.status === 409) alert("⚠️ " + error.response.data.error);
      else alert("Error: " + (error.response?.data?.details || error.message));
    } finally {
      setLoading(false);
    }
  };

  const toggleColumn = (col) => {
      if (selectedColumns.includes(col)) setSelectedColumns(selectedColumns.filter(c => c !== col));
      else setSelectedColumns([...selectedColumns, col]);
  };

  const handleSelectAll = () => setSelectedColumns([...originalHeaders]);
  const handleClearAll = () => setSelectedColumns([]);

  const handleTypeChange = (col, value) => {
    setColumnTypes(prev => ({ ...prev, [col]: value }));
  };

  return (
    <div style={styles.mainWrapper}>
      <div style={styles.container}>
        
        <h1 style={{textAlign: "center", color: "#333", marginBottom: "30px"}}>OmniData ETL</h1>

        {/* 1. UPLOAD BOX */}
        <div style={{ background: "#fff", padding: "30px", borderRadius: "8px", boxShadow: "0 2px 5px rgba(0,0,0,0.1)", textAlign: "center" }}>
          <input type="file" accept=".xlsx,.xls,.csv,.txt,.md,.json,.accdb,.mdb" onChange={handleFileChange} style={{border: "1px solid #ccc", padding: "10px", borderRadius: "4px"}} />
          <button onClick={handleUpload} style={{ marginLeft: "10px", padding: "10px 25px", background: "#007bff", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>Upload</button>
        </div>

        {/* 2. INTERACTIVE PREVIEW */}
        {preview.length > 0 && (
          <div style={{ marginTop: "30px" }}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px"}}>
                <div>
                    <h3 style={{margin:0}}>Select Columns to Import</h3>
                    <p style={{margin:"5px 0 0 0", fontSize: "14px", color: "#666"}}>Click Headers to Select</p>
                </div>
                <div style={{display: "flex", gap: "10px"}}>
                    <button onClick={handleSelectAll} style={{padding: "8px 15px", background: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: "pointer"}}>Select All</button>
                    <button onClick={handleClearAll} style={{padding: "8px 15px", background: "none", border: "1px solid #dc3545", color: "#dc3545", borderRadius: "4px", cursor: "pointer"}}>Clear</button>
                </div>
            </div>

            <div style={styles.tableWrapper}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr>
                    {originalHeaders.map(col => {
                        const isSelected = selectedColumns.includes(col);
                        return (
                            <th 
                                key={col} 
                                onClick={() => toggleColumn(col)}
                                style={isSelected ? styles.thSelected : styles.thDefault}
                            >
                                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px"}}>
                                    {col}
                                    {isSelected && <span>✅</span>}
                                </div>
                            </th>
                        );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} style={{borderBottom: "1px solid #eee"}}>
                      {originalHeaders.map(col => {
                          const isSelected = selectedColumns.includes(col);
                          return (
                            <td key={col} style={{padding: "8px", whiteSpace: "nowrap", background: isSelected ? "#f0f8ff" : "white"}}>
                                {typeof row[col] === 'object' ? JSON.stringify(row[col]) : row[col]}
                            </td>
                          );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. SUMMARY & SAVE */}
        {selectedColumns.length > 0 && (
          <div style={styles.summaryBox}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <h4 style={{margin:0, color: "#0d47a1"}}>Selected ({selectedColumns.length})</h4>
                <button onClick={() => setShowTypeModal(true)} style={{padding: "8px 15px", background: "#6f42c1", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "13px"}}>
                    ⚙️ Configure Data Types
                </button>
            </div>
            
            <div style={{display: "flex", flexWrap: "wrap", gap: "8px", maxHeight: "100px", overflowY: "auto"}}>
                {selectedColumns.map(col => (
                    <span key={col} style={styles.tag}>
                        {col}
                        <span onClick={() => toggleColumn(col)} style={{cursor: "pointer", fontWeight: "bold", marginLeft: "5px", opacity: 0.8}}>✕</span>
                    </span>
                ))}
            </div>

            <div style={{ borderTop: "1px solid #90caf9", paddingTop: "15px", marginTop: "10px", display: "flex", justifyContent: "center", gap: "15px" }}>
                <input type="text" placeholder="Table Name" value={tableName} onChange={e => setTableName(e.target.value)} style={{padding: "10px", width: "300px", border: "1px solid #ccc", borderRadius: "4px"}} />
                <button onClick={handleSaveToDB} style={{padding: "10px 40px", background: "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", fontSize: "16px"}}>
                    Save to Database
                </button>
            </div>
          </div>
        )}
      </div>

      {/* --- IMPROVED TYPE MODAL --- */}
      {showTypeModal && (
        <div style={styles.modalBackdrop}>
          <div style={styles.modalContent}>
            <div style={{display:"flex", justifyContent:"space-between", marginBottom:"20px"}}>
                <h3 style={{margin:0}}>Set Data Types</h3>
                <button onClick={() => setShowTypeModal(false)} style={{border:"none", background:"none", fontSize:"20px", cursor:"pointer"}}>✕</button>
            </div>
            <p style={{fontSize:"13px", color:"#666"}}>Use the dropdown to pick a type, or edit the text box manually (e.g. change <b>MAX</b> to <b>500</b>).</p>
            
            <div style={{borderTop: "1px solid #eee", marginTop: "10px"}}>
              {selectedColumns.map(col => (
                <div key={col} style={{display: "flex", justifyContent: "space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f0f0f0"}}>
                  <b style={{fontSize: "14px", width: "30%"}}>{col}</b>
                  
                  <div style={{display: "flex", gap: "10px", width: "70%"}}>
                    {/* EDITABLE TEXT INPUT */}
                    <input 
                        type="text" 
                        value={columnTypes[col] || "NVARCHAR(MAX)"} 
                        onChange={(e) => handleTypeChange(col, e.target.value)}
                        style={{flex: 1, padding: "6px", border: "1px solid #ccc", borderRadius: "4px", fontSize: "13px"}}
                    />
                    
                    {/* PRESET DROPDOWN */}
                    <select 
                        onChange={(e) => {
                             if(e.target.value) handleTypeChange(col, e.target.value);
                        }} 
                        style={{width: "140px", padding: "6px", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer"}}
                        title="Pick a preset"
                        value="" // Always reset so you can pick the same thing again
                    >
                        <option value="" disabled>select </option>
                        
                        {Object.keys(SQL_DATA_TYPES).map(group => (
                        <optgroup key={group} label={group}>
                            {SQL_DATA_TYPES[group].map(t => <option key={t} value={t}>{t}</option>)}
                        </optgroup>
                        ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowTypeModal(false)} style={{marginTop:"20px", width:"100%", padding:"10px", background:"#28a745", color:"white", border:"none", borderRadius:"4px", cursor:"pointer", fontWeight: "bold"}}>Save & Close</button>
          </div>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div style={styles.overlay}>
          <h3>{loadingMessage}</h3>
          <div style={{width: "300px", height: "20px", background: "#ddd", borderRadius: "10px", overflow: "hidden", marginTop: "10px"}}>
            {isIndeterminate ? 
              <div style={{width: "100%", height: "100%", background: "linear-gradient(45deg, #28a745 25%, #218838 25%, #218838 50%, #28a745 50%, #28a745 75%, #218838 75%, #218838 100%)", backgroundSize: "40px 40px"}} /> : 
              <div style={{width: `${uploadProgress}%`, height: "100%", background: "#007bff", transition: "width 0.2s"}} />
            }
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
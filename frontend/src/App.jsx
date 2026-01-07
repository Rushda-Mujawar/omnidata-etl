import React, { useState } from "react";
import axios from "axios";

// --- STYLES FOR PROGRESS BAR ---
const styles = {
  overlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  },
  progressBarContainer: {
    width: "50%",
    height: "25px",
    backgroundColor: "#e0e0e0",
    borderRadius: "15px",
    overflow: "hidden",
    marginTop: "20px",
    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)"
  },
  // Real progress (Upload)
  progressBarFill: (percent) => ({
    width: `${percent}%`,
    height: "100%",
    backgroundColor: "#007bff",
    transition: "width 0.2s ease-in-out",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontSize: "12px",
    fontWeight: "bold"
  }),
  // Indeterminate progress (Saving/Processing)
  progressBarIndeterminate: {
    width: "100%",
    height: "100%",
    background: "linear-gradient(45deg, #28a745 25%, #218838 25%, #218838 50%, #28a745 50%, #28a745 75%, #218838 75%, #218838 100%)",
    backgroundSize: "40px 40px",
    animation: "stripe-move 1s linear infinite", // Requires keyframes in CSS
  }
};

function App() {
  const [file, setFile] = useState(null);
  
  // Data States
  const [originalHeaders, setOriginalHeaders] = useState([]); 
  const [availableColumns, setAvailableColumns] = useState([]); 
  const [selectedColumns, setSelectedColumns] = useState([]);  
  const [preview, setPreview] = useState([]);
  const [serverFilename, setServerFilename] = useState(""); 
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isIndeterminate, setIsIndeterminate] = useState(false); // For "Saving..." state

  const [tableName, setTableName] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [showPreview, setShowPreview] = useState(true); 

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setUploadStatus("");
    setPreview([]);
    setServerFilename("");
  };

  const handleUpload = async () => {
    if (!file) return alert("Please select a file");

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    setLoadingMessage("Uploading File...");
    setUploadProgress(0);
    setIsIndeterminate(false);

    try {
      const response = await axios.post("http://localhost:5000/upload", formData, {
        // AXIOS PROGRESS TRACKER
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
          if (percentCompleted === 100) {
            setLoadingMessage("Processing Preview...");
            setIsIndeterminate(true); // Switch to striped bar while server parses
          }
        },
      });

      const headers = response.data.headers || [];
      setOriginalHeaders(headers);
      setAvailableColumns(headers);
      setPreview(response.data.preview || []);
      setServerFilename(response.data.filename); 
      setSelectedColumns([]); 
      setUploadStatus("File parsed successfully! (Hosted on Server)");
      setShowPreview(true);
    } catch (error) {
      console.error("Upload error", error);
      const msg = error.response?.data?.error || "Error uploading file.";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDB = async () => {
    if (!tableName) return alert("Please enter a Table Name");
    if (selectedColumns.length === 0) return alert("Please map at least one column");
    if (!serverFilename) return alert("File session expired. Please upload again.");

    setLoading(true);
    setLoadingMessage("Saving to Database...");
    setIsIndeterminate(true); 

    try {
      await axios.post("http://localhost:5000/save", {
        tableName: tableName,
        selectedColumns: selectedColumns,
        filename: serverFilename
      });
      
      alert("Success! Data saved to table: " + tableName);
      setUploadStatus("Data saved successfully!");
      setTableName("");
      setServerFilename(""); 
      setPreview([]);
      setOriginalHeaders([]);

    } catch (error) {
      console.error("Save error", error);
      
      // --- NEW CHANGE START ---
      if (error.response && error.response.status === 409) {
          // This is our specific "Table Exists" warning
          alert("⚠️ WARNING: " + error.response.data.error);
      } else {
          // Standard error
          const serverError = error.response?.data?.details || error.message;
          alert("Error saving data: " + serverError);
      }
      // --- NEW CHANGE END ---
    } finally {
      setLoading(false);
    }
  };

  // --- DRAG & DROP UTILS ---
  const moveToSelected = (columnName) => {
    if (!selectedColumns.includes(columnName)) {
      setSelectedColumns([...selectedColumns, columnName]);
      setAvailableColumns(availableColumns.filter((col) => col !== columnName));
    }
  };
  const moveToAvailable = (columnName) => {
    if (!availableColumns.includes(columnName)) {
      setAvailableColumns([...availableColumns, columnName]);
      setSelectedColumns(selectedColumns.filter((col) => col !== columnName));
    }
  };
  const onDragStart = (e, columnName) => e.dataTransfer.setData("columnName", columnName);
  const onDropToSelected = (e) => moveToSelected(e.dataTransfer.getData("columnName"));
  const onDropToAvailable = (e) => moveToAvailable(e.dataTransfer.getData("columnName"));
  const allowDrop = (e) => e.preventDefault();

  return (
    <div style={{ padding: "40px", fontFamily: "Segoe UI, sans-serif", backgroundColor: "#f4f7f6", minHeight: "100vh" }}>
      
      {/* --- GLOBAL STYLES FOR ANIMATION --- */}
      <style>
        {`
          @keyframes stripe-move {
            0% { background-position: 0 0; }
            100% { background-position: 40px 40px; }
          }
        `}
      </style>

      {/* --- LOADING OVERLAY --- */}
      {loading && (
        <div style={styles.overlay}>
          <h2 style={{color: "#333"}}>{loadingMessage}</h2>
          
          <div style={styles.progressBarContainer}>
            {isIndeterminate ? (
              // Option 2: Indeterminate (Striped Animation for Save/Processing)
              <div style={styles.progressBarIndeterminate}></div>
            ) : (
              // Option 1: Real Percentage (For Upload)
              <div style={styles.progressBarFill(uploadProgress)}>
                {uploadProgress}%
              </div>
            )}
          </div>
          
          <p style={{marginTop: "10px", color: "#666"}}>
             {isIndeterminate ? "Please do not close this window." : "Uploading..."}
          </p>
        </div>
      )}

      <h1 style={{textAlign: "center", color: "#333", marginTop: 0}}>OmniData ETL</h1>
      
      {/* 1. UPLOAD SECTION */}
      <div style={{ background: "#fff", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 5px rgba(0,0,0,0.1)", marginBottom: "20px", textAlign: "center" }}>       
        <input 
            type="file" 
            accept=".xlsx, .xls, .csv, .txt, .md, .json, .accdb, .mdb"  // Added .accdb and .mdb
            onChange={handleFileChange} 
            style={{padding: "10px"}} 
        />
        <button 
          onClick={handleUpload} 
          disabled={loading}
          style={{ marginLeft: "10px", padding: "8px 25px", background: "#007bff", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "15px" }}
        >
          Upload File
        </button>
        <p style={{fontSize: "12px", color: "#666", marginTop: "10px"}}>
            Supports Large Files (100MB+) 
        </p>
      </div>

      {preview.length > 0 && (
        <>
          {/* 2. PREVIEW SECTION */}
          <div style={{ background: "#fff", padding: "15px", borderRadius: "8px", boxShadow: "0 2px 5px rgba(0,0,0,0.1)", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "15px", marginBottom: "10px" }}>
                <h3 style={{ margin: 0 }}>File Preview</h3>
                <button 
                    onClick={() => setShowPreview(!showPreview)}
                    style={{
                        padding: "5px 12px", 
                        cursor: "pointer", 
                        background: showPreview ? "#6c757d" : "#28a745", 
                        color: "white", 
                        border: "none", 
                        borderRadius: "4px",
                        fontSize: "12px"
                    }}
                >
                    {showPreview ? "Hide Table" : "Show Table"}
                </button>
            </div>
            
            {showPreview && (
                <div style={{ width: "100%", overflowX: "auto", overflowY: "auto", border: "1px solid #ddd", maxHeight: "300px", fontSize: "13px" }}>
                <table border="1" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ background: "#f1f3f5", position: "sticky", top: 0, zIndex: 5 }}>
                    <tr>
                        {originalHeaders.map((col) => (
                        <th key={col} style={{ padding: "8px", textAlign: "left", whiteSpace: "nowrap", borderBottom: "2px solid #ddd", background: "#f1f3f5" }}>{col}</th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {preview.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                        {originalHeaders.map((col) => (
                            <td key={col} style={{ padding: "6px", whiteSpace: "nowrap" }}>
                                {typeof row[col] === 'object' && row[col] !== null 
                                    ? JSON.stringify(row[col]) 
                                    : (row[col] !== undefined ? row[col] : "")}
                            </td>
                        ))}
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            )}
          </div>

          {/* 3. MAPPING SECTION */}
          <div style={{ display: "flex", gap: "20px", marginBottom: "30px", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div 
              onDragOver={allowDrop} 
              onDrop={onDropToAvailable}
              style={{ flex: 1, minWidth: "300px", background: "#fff", padding: "20px", borderRadius: "8px", border: "2px dashed #ccc", maxHeight: "400px", overflowY: "auto" }}
            >
              <h4 style={{marginTop: 0}}>Available Columns</h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {availableColumns.map((col) => (
                  <div
                    key={col}
                    draggable
                    onDragStart={(e) => onDragStart(e, col)}
                    onClick={() => moveToSelected(col)}
                    style={{ padding: "6px 12px", background: "#e9ecef", border: "1px solid #ced4da", borderRadius: "4px", cursor: "pointer", userSelect: "none", fontSize: "14px" }}
                  >
                    {col} ➝
                  </div>
                ))}
              </div>
            </div>

            <div 
              onDragOver={allowDrop} 
              onDrop={onDropToSelected}
              style={{ flex: 1, minWidth: "300px", background: "#e3f2fd", padding: "20px", borderRadius: "8px", border: "2px dashed #2196f3", maxHeight: "400px", overflowY: "auto" }}
            >
              <h4 style={{ color: "#0d47a1", marginTop: 0 }}>Mapped Columns</h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {selectedColumns.map((col) => (
                  <div
                    key={col}
                    draggable
                    onDragStart={(e) => onDragStart(e, col)}
                    onClick={() => moveToAvailable(col)}
                    style={{ padding: "6px 12px", background: "#2196f3", color: "#fff", borderRadius: "4px", cursor: "pointer", userSelect: "none", fontWeight: "bold", fontSize: "14px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}
                  >
                    {col} ✕
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4. SAVE SECTION */}
          <div style={{ background: "#fff", padding: "25px", borderRadius: "8px", borderTop: "5px solid #28a745", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "15px" }}>
                <span style={{fontWeight: "bold", fontSize: "18px"}}>Target Table Name:</span>
                <input 
                    type="text" 
                    placeholder="e.g. big_data_2024" 
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    style={{padding: "10px", width: "300px", fontSize: "16px", border: "1px solid #ccc", borderRadius: "4px"}}
                />
                <button 
                    onClick={handleSaveToDB}
                    disabled={loading}
                    style={{ padding: "10px 30px", background: "#28a745", color: "#fff", border: "none", borderRadius: "4px", fontSize: "16px", cursor: "pointer", fontWeight: "bold" }}
                >
                    Save to Database
                </button>
              </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
import React, { useState, useRef } from "react";
import { Upload, X, AlertTriangle, CheckCircle2, FileUp, ListChecks, Download, Database, ChevronRight, Check } from "lucide-react";
import Papa from "papaparse";
import { fbInsert, fbGet, fbUpdate } from "./firebase.js";

// Simple motion wrapper fallback (no framer-motion needed)
const motion = {
  div: ({ children, style, ...rest }) => <div style={style}>{children}</div>
};
const AnimatePresence = ({ children }) => <>{children}</>;

const CsvImportModule = ({ A, onClose, onImportSuccess }) => {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Mapping
  const [headers, setHeaders] = useState([]);
  const [mappings, setMappings] = useState({});
  const [rawData, setRawData] = useState([]);
  
  // Validation
  const [validRows, setValidRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [duplicates, setDuplicates] = useState(0);
  
  const [importing, setImporting] = useState(false);
  const [history, setHistory] = useState(null);
  const fileInputRef = useRef(null);
  
  const requiredFields = [
    { key: "name", label: "Product Name*" },
    { key: "category", label: "Category*" },
    { key: "selling_price", label: "Selling Price*" },
    { key: "stock_quantity", label: "Stock Qty*" },
  ];
  
  const optionalFields = [
    { key: "barcode", label: "Barcode" },
    { key: "sku", label: "SKU" },
    { key: "cost_price", label: "Cost Price" },
  ];

  const handleFileUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith(".csv")) {
      alert("Only CSV files are supported.");
      return;
    }
    setFile(f);
    setParsing(true);
    
    // Read and parse file
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setHeaders(results.meta.fields || []);
        setRawData(results.data || []);
        
        // Auto map aliases
        const initialMap = {};
        const aliases = {
          name: ["product name", "item name", "title"],
          category: ["cat", "type", "department"],
          selling_price: ["price", "mrp", "selling price", "retail"],
          stock_quantity: ["stock", "qty", "quantity", "inventory"],
          barcode: ["ean", "upc", "bar code"],
          sku: ["item code", "code"]
        };
        
        results.meta.fields.forEach(header => {
          const lowerH = header.toLowerCase().trim();
          [...requiredFields, ...optionalFields].forEach(field => {
            if (lowerH === field.key || aliases[field.key]?.includes(lowerH)) {
              initialMap[field.key] = header;
            }
          });
        });
        setMappings(initialMap);
        setParsing(false);
        setStep(2);
      },
      error: (err) => {
        alert("Failed to parse CSV: " + err.message);
        setParsing(false);
      }
    });
  };

  const handleValidate = async () => {
    // Pure client-side validation — no backend needed
    setParsing(true);
    await new Promise(r => setTimeout(r, 300)); // small delay for UX
    const valid = [];
    const errs = [];
    rawData.forEach((row, i) => {
      const mapped = {
        name: (row[mappings.name] || "").trim(),
        category: (row[mappings.category] || "Uncategorized").trim(),
        selling_price: parseFloat(row[mappings.selling_price] || 0),
        stock_quantity: parseInt(row[mappings.stock_quantity] || 0),
        barcode: row[mappings.barcode] || "",
        cost_price: parseFloat(row[mappings.cost_price] || 0),
      };
      if (!mapped.name) {
        errs.push({ rowNumber: i + 2, errorMessage: "Missing Product Name" });
      } else if (isNaN(mapped.selling_price) || mapped.selling_price <= 0) {
        errs.push({ rowNumber: i + 2, errorMessage: `Invalid price for "${mapped.name}"` });
      } else {
        valid.push(mapped);
      }
    });
    setValidRows(valid);
    setErrors(errs);
    setDuplicates(0);
    setParsing(false);
    setStep(3);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      // Fetch existing products to detect duplicates by name
      const existing = await fbGet("products");
      let inserted = 0, updated = 0;

      for (const row of validRows) {
        const product = {
          name: row.name,
          cat: row.category,
          price: row.selling_price,
          stock: row.stock_quantity,
          cost: row.cost_price || 0,
          barcode: row.barcode || "",
          e: "📦",
          img: "",
        };
        const dup = existing.find(
          p => p.name?.toLowerCase() === row.name.toLowerCase() ||
               (row.barcode && p.barcode === row.barcode)
        );
        if (dup) {
          await fbUpdate("products", dup.id, product);
          updated++;
        } else {
          await fbInsert("products", product);
          inserted++;
        }
      }

      setStep(4);
      if (onImportSuccess) onImportSuccess();
    } catch (err) {
      alert("Import failed: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadErrors = () => {
    if (!errors.length) return;
    // Simple CSV download — no xlsx dependency needed
    const header = "Row,Error\n";
    const rows = errors.map(e => `${e.rowNumber},"${e.errorMessage}"`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "import_errors.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const renderStepIcon = (s, label, icon) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1, opacity: step >= s ? 1 : 0.4 }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", background: step > s ? A.accent : step === s ? `${A.accent}30` : A.surf, border: `2px solid ${step >= s ? A.accent : A.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: step > s ? "#fff" : A.text, transition: "all 0.3s" }}>
        {step > s ? <Check size={20} /> : icon}
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: step >= s ? A.text : A.muted }}>{label}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: A.bg, display: "flex", flexDirection: "column", animation: "fadein 0.2s ease" }}>
      {/* Header */}
      <div style={{ height: 70, borderBottom: `1px solid ${A.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", background: A.surf }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${A.accent}20`, display: "flex", alignItems: "center", justifyContent: "center" }}><Database size={18} color={A.accent} /></div>
          <div>
            <h2 style={{ color: A.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Data Import Wizard</h2>
            <p style={{ color: A.muted, fontSize: 12, margin: 0 }}>Import products from CSV</p>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: A.muted, padding: 8 }}><X size={20} /></button>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Sidebar */}
        <div style={{ width: 320, borderRight: `1px solid ${A.border}`, background: A.surf, padding: "32px 24px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", position: "relative", marginBottom: 40 }}>
            {renderStepIcon(1, "Upload", <Upload size={18} />)}
            {renderStepIcon(2, "Map", <ListChecks size={18} />)}
            {renderStepIcon(3, "Validate", <CheckCircle2 size={18} />)}
          </div>
          
          <div style={{ flex: 1 }}>
            <h3 style={{ color: A.text, fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Import Guidelines</h3>
            <ul style={{ padding: 0, margin: 0, listStyle: "none", color: A.muted, fontSize: 13, display: "flex", flexDirection: "column", gap: 10 }}>
              <li style={{ display: "flex", gap: 8 }}><span style={{ color: A.accent }}>•</span> Only CSV files are supported</li>
              <li style={{ display: "flex", gap: 8 }}><span style={{ color: A.accent }}>•</span> Max 10,000 rows per file</li>
              <li style={{ display: "flex", gap: 8 }}><span style={{ color: A.accent }}>•</span> Required: Name, Category, Price, Stock</li>
              <li style={{ display: "flex", gap: 8 }}><span style={{ color: A.accent }}>•</span> Duplicates matching Barcode or Name will be updated</li>
            </ul>
          </div>
          
          <button style={{ padding: "12px", background: "none", border: `1px dashed ${A.border}`, borderRadius: 8, color: A.muted, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Download size={16} /> Download Sample CSV
          </button>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: 40, overflowY: "auto", background: A.bg }}>
          <AnimatePresence mode="wait">
            
            {/* STEP 1: UPLOAD */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "100%", maxWidth: 600, padding: 60, border: `2px dashed ${A.border}`, borderRadius: 20, background: A.surf, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", cursor: "pointer", transition: "all 0.2s" }} onClick={() => fileInputRef.current.click()} onMouseEnter={e => e.currentTarget.style.borderColor = A.accent} onMouseLeave={e => e.currentTarget.style.borderColor = A.border}>
                  <div style={{ width: 80, height: 80, borderRadius: "50%", background: `${A.accent}15`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <FileUp size={32} color={A.accent} />
                  </div>
                  <h3 style={{ color: A.text, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Drag & Drop CSV File</h3>
                  <p style={{ color: A.muted, fontSize: 14 }}>or click to browse from your computer</p>
                  <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: "none" }} />
                </div>
              </motion.div>
            )}

            {/* STEP 2: MAPPING */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ color: A.text, fontSize: 20, fontWeight: 700 }}>Map CSV Columns</h3>
                  <button onClick={handleValidate} disabled={parsing} style={{ padding: "10px 20px", background: A.accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                    {parsing ? "Validating..." : "Next: Validate Data"} <ChevronRight size={16} />
                  </button>
                </div>
                
                <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 12, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${A.border}`, background: `${A.border}40` }}>
                        <th style={{ padding: "16px 20px", textAlign: "left", color: A.muted, fontSize: 12, textTransform: "uppercase" }}>System Field</th>
                        <th style={{ padding: "16px 20px", textAlign: "left", color: A.muted, fontSize: 12, textTransform: "uppercase" }}>CSV Column</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...requiredFields, ...optionalFields].map((field, i) => (
                        <tr key={field.key} style={{ borderBottom: `1px solid ${A.border}` }}>
                          <td style={{ padding: "16px 20px", color: A.text, fontSize: 14, fontWeight: 500 }}>
                            {field.label} {requiredFields.find(r => r.key === field.key) && <span style={{ color: A.danger }}>*</span>}
                          </td>
                          <td style={{ padding: "16px 20px" }}>
                            <select value={mappings[field.key] || ""} onChange={(e) => setMappings(p => ({ ...p, [field.key]: e.target.value }))} style={{ width: "100%", maxWidth: 300, padding: "10px 14px", background: A.bg, border: `1px solid ${A.border}`, borderRadius: 8, color: A.text, fontSize: 14, outline: "none" }}>
                              <option value="">-- Ignore --</option>
                              {headers.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* STEP 3: VALIDATION */}
            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ color: A.text, fontSize: 20, fontWeight: 700 }}>Validation Summary</h3>
                  <button onClick={handleImport} disabled={importing || validRows.length === 0} style={{ padding: "10px 20px", background: validRows.length > 0 ? A.accent : A.border, border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                    {importing ? "Importing..." : `Import ${validRows.length} Rows`} <Check size={16} />
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
                  <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 12, padding: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><CheckCircle2 size={20} color="#00D4AA" /><span style={{ color: A.muted, fontSize: 13, textTransform: "uppercase" }}>Valid Rows</span></div>
                    <span style={{ fontSize: 32, fontWeight: 700, color: "#00D4AA" }}>{validRows.length}</span>
                  </div>
                  <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 12, padding: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><AlertTriangle size={20} color={A.danger} /><span style={{ color: A.muted, fontSize: 13, textTransform: "uppercase" }}>Errors</span></div>
                    <span style={{ fontSize: 32, fontWeight: 700, color: A.danger }}>{errors.length}</span>
                    {errors.length > 0 && <button onClick={downloadErrors} style={{ marginTop: 10, background: "none", border: "none", color: A.accent, fontSize: 12, cursor: "pointer" }}>Download Errors CSV</button>}
                  </div>
                  <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 12, padding: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><Database size={20} color={A.warn} /><span style={{ color: A.muted, fontSize: 13, textTransform: "uppercase" }}>Duplicates (Update)</span></div>
                    <span style={{ fontSize: 32, fontWeight: 700, color: A.warn }}>{duplicates}</span>
                  </div>
                </div>

                {/* Preview Table */}
                <h4 style={{ color: A.text, fontSize: 15, marginBottom: 12 }}>Preview (First 10 Valid Rows)</h4>
                <div style={{ background: A.surf, border: `1px solid ${A.border}`, borderRadius: 12, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${A.border}`, background: `${A.border}40` }}>
                        <th style={{ padding: "12px 16px", textAlign: "left", color: A.muted, fontSize: 12 }}>Name</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", color: A.muted, fontSize: 12 }}>Category</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", color: A.muted, fontSize: 12 }}>Price</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", color: A.muted, fontSize: 12 }}>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${A.border}` }}>
                          <td style={{ padding: "12px 16px", color: A.text, fontSize: 13 }}>{r.name}</td>
                          <td style={{ padding: "12px 16px", color: A.text, fontSize: 13 }}>{r.category}</td>
                          <td style={{ padding: "12px 16px", color: A.text, fontSize: 13 }}>₹{r.selling_price}</td>
                          <td style={{ padding: "12px 16px", color: A.text, fontSize: 13 }}>{r.stock_quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* STEP 4: SUCCESS */}
            {step === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#00D4AA20", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                  <CheckCircle2 size={40} color="#00D4AA" />
                </div>
                <h3 style={{ color: A.text, fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Import Successful!</h3>
                <p style={{ color: A.muted, fontSize: 15, marginBottom: 32 }}>Successfully processed {validRows.length} rows.</p>
                <button onClick={onClose} style={{ padding: "12px 32px", background: A.accent, border: "none", borderRadius: 8, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Return to Dashboard</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default CsvImportModule;

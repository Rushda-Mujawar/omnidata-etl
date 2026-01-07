const express = require("express");
const cors = require("cors");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const pool = require("./db");
const readline = require("readline");
const ADODB = require('node-adodb');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Setup Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, "uploads");
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${Date.now()}${ext}`);
    }
});

const upload = multer({ storage: storage });

app.get("/", (req, res) => res.send("Backend running"));

// --- HELPER: Access Database Reader ---
async function readAccessFile(filePath, limitRows = null) {
    // Requires Microsoft Access Database Engine 2016 Redistributable (x64) installed
    const connection = ADODB.open(`Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${filePath};Persist Security Info=False;`);

    try {
        const schema = await connection.schema(20); // 20 = adSchemaTables
        const userTables = schema.filter(t => t.TABLE_TYPE === 'TABLE');

        if (userTables.length === 0) throw new Error("No tables found in Access database.");
        
        const tableName = userTables[0].TABLE_NAME;
        console.log(`[Access] Found table: ${tableName}`);

        let query = `SELECT * FROM [${tableName}]`;
        if (limitRows) {
            query = `SELECT TOP ${limitRows} * FROM [${tableName}]`;
        }

        const data = await connection.query(query);
        return data;
    } catch (error) {
        console.error("Access DB Error:", error);
        throw new Error("Could not read Access file. Ensure 'Microsoft Access Database Engine' is installed.");
    }
}

// --- UPLOAD ROUTE ---
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const filePath = req.file.path;
        const ext = path.extname(req.file.originalname).toLowerCase();
        let previewData = [];

        // === TYPE A: ACCESS FILES (.accdb, .mdb) ===
        if (['.accdb', '.mdb'].includes(ext)) {
            previewData = await readAccessFile(filePath, 10);
            if (previewData.length === 0) return res.status(400).json({ error: "Access Table appears empty" });

            return res.json({
                headers: Object.keys(previewData[0]),
                preview: previewData,
                filename: req.file.filename
            });
        }

        // === TYPE B: EXCEL FILES ===
        else if (['.xlsx', '.xls'].includes(ext)) {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            previewData = xlsx.utils.sheet_to_json(sheet, { defval: "", sheetRows: 10 });
            
            if (previewData.length === 0) return res.status(400).json({ error: "Excel file appears empty" });

            return res.json({
                headers: Object.keys(previewData[0]),
                preview: previewData,
                filename: req.file.filename
            });
        }

        // === TYPE C: TEXT / CSV ===
        else {
            const fileStream = fs.createReadStream(filePath);
            const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
            let lines = [];
            
            for await (const line of rl) {
                if(lines.length < 11) lines.push(line);
                else { rl.close(); break; }
            }

            if (lines.length === 0) return res.status(400).json({ error: "File appears empty" });

            let delimiter = ",";
            if (lines[0].includes("\t")) delimiter = "\t";
            else if (lines[0].includes("|")) delimiter = "|";

            const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, '').replace(/^\||\|$/g, ''));
            
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].includes('---')) continue;
                const cells = lines[i].split(delimiter).map(c => c.trim().replace(/^"|"$/g, '').replace(/^\||\|$/g, ''));
                let row = {};
                headers.forEach((h, idx) => { row[h] = cells[idx] || ""; });
                previewData.push(row);
            }

            return res.json({
                headers: headers,
                preview: previewData,
                filename: req.file.filename
            });
        }

    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Parsing failed: " + error.message });
    }
});

// --- SAVE ROUTE ---
app.post("/save", async (req, res) => {
    const { tableName, selectedColumns, filename } = req.body;
    if (!tableName || !selectedColumns || !filename) return res.status(400).json({ error: "Missing data" });

    const filePath = path.join(__dirname, "uploads", filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File expired. Upload again." });

    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    const ext = path.extname(filename).toLowerCase();
    const client = await pool.connect();

    try {
        // 1. Check if table exists (Prevent Overwrite)
        const checkQuery = await client.query(
            `SELECT to_regclass('public.${safeTableName}') as table_exists`
        );

        if (checkQuery.rows[0].table_exists) {
            return res.status(409).json({ 
                error: `Table '${tableName}' already exists. Please choose a different name.` 
            });
        }

        console.log(`[Save] Processing ${filename} (${ext})...`);

        await client.query("BEGIN");
        
        // 2. Create Table
        const columnDefinitions = selectedColumns.map(col => `"${col}" TEXT`).join(", ");
        await client.query(`CREATE TABLE ${safeTableName} (id SERIAL PRIMARY KEY, ${columnDefinitions});`);
        
        // === TYPE A: ACCESS FILES ===
        if (['.accdb', '.mdb'].includes(ext)) {
            const data = await readAccessFile(filePath, null); 
            console.log(`[Access] Extracted ${data.length} rows.`);

            const BATCH_SIZE = 1000;
            for (let i = 0; i < data.length; i += BATCH_SIZE) {
                const batch = data.slice(i, i + BATCH_SIZE);
                await insertBatch(client, safeTableName, selectedColumns, batch);
                if ((i + BATCH_SIZE) % 5000 === 0) console.log(`[Access] Inserted ${i + BATCH_SIZE} rows...`);
            }
        }

        // === TYPE B: EXCEL FILES ===
        else if (['.xlsx', '.xls'].includes(ext)) {
            const workbook = xlsx.readFile(filePath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = xlsx.utils.sheet_to_json(sheet, { defval: "" });

            const BATCH_SIZE = 1000;
            for (let i = 0; i < data.length; i += BATCH_SIZE) {
                const batch = data.slice(i, i + BATCH_SIZE);
                await insertBatch(client, safeTableName, selectedColumns, batch);
                if ((i + BATCH_SIZE) % 5000 === 0) console.log(`[Excel] Inserted ${i + BATCH_SIZE} rows...`);
            }
        } 
        
        // === TYPE C: TEXT / CSV (Streaming) ===
        else {
            const fileStream = fs.createReadStream(filePath);
            const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

            let headers = [];
            let batch = [];
            let isFirstLine = true;
            let delimiter = ",";

            for await (const line of rl) {
                if (!line.trim()) continue;
                if (isFirstLine) {
                    if (line.includes("\t")) delimiter = "\t";
                    else if (line.includes("|")) delimiter = "|";
                    headers = line.split(delimiter).map(h => h.trim().replace(/^"|"$/g, '').replace(/^\||\|$/g, ''));
                    isFirstLine = false; 
                    continue;
                }
                if (line.includes('---')) continue;

                const cells = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, '').replace(/^\||\|$/g, ''));
                let rowData = {};
                headers.forEach((h, idx) => { 
                    if (selectedColumns.includes(h)) rowData[h] = cells[idx] || null;
                });
                batch.push(rowData);

                if (batch.length >= 2000) {
                    await insertBatch(client, safeTableName, selectedColumns, batch);
                    batch = [];
                }
            }
            if (batch.length > 0) await insertBatch(client, safeTableName, selectedColumns, batch);
        }

        await client.query("COMMIT");
        console.log(`[Save] Completed successfully.`);
        fs.unlinkSync(filePath);

        res.json({ message: "Successfully saved data." });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Database Error:", err);
        res.status(500).json({ error: "Database Error", details: err.message });
    } finally {
        client.release();
    }
});

async function insertBatch(client, tableName, columns, batchData) {
    if (batchData.length === 0) return;
    const values = [];
    const placeholders = [];
    
    batchData.forEach((row, rowIndex) => {
        const rowValues = [];
        columns.forEach((col) => {
            let val = row[col];
            if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
            rowValues.push(val);
        });
        values.push(...rowValues);
        const rowPlaceholders = columns.map((_, colIndex) => `$${(rowIndex * columns.length) + colIndex + 1}`);
        placeholders.push(`(${rowPlaceholders.join(", ")})`);
    });

    const colNames = columns.map(col => `"${col}"`).join(", ");
    const query = `INSERT INTO ${tableName} (${colNames}) VALUES ${placeholders.join(", ")}`;
    await client.query(query, values);
}

app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
});
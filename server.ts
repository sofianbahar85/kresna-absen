import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("kresna_absen.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position TEXT,
    department TEXT,
    role TEXT DEFAULT 'employee'
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    status TEXT NOT NULL,
    location_lat REAL,
    location_lng REAL,
    notes TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Insert default admin if not exists
const adminExists = db.prepare("SELECT * FROM employees WHERE role = 'admin'").get();
if (!adminExists) {
  db.prepare("INSERT INTO employees (id, name, position, department, role) VALUES (?, ?, ?, ?, ?)").run(
    "ADMIN123", "Administrator", "IT Manager", "IT", "admin"
  );
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.post("/api/login", (req, res) => {
    const { employeeId } = req.body;
    const employee = db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId);
    if (employee) {
      res.json({ success: true, employee });
    } else {
      res.status(401).json({ success: false, message: "ID Karyawan tidak terdaftar" });
    }
  });

  app.get("/api/attendance/today/:employeeId", (req, res) => {
    const { employeeId } = req.params;
    const today = new Date().toISOString().split("T")[0];
    const attendance = db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND date = ?").get(employeeId, today);
    res.json({ attendance });
  });

  app.get("/api/attendance/history/:employeeId", (req, res) => {
    const { employeeId } = req.params;
    const history = db.prepare(`
      SELECT * FROM attendance 
      WHERE employee_id = ? 
      ORDER BY date DESC, time DESC 
      LIMIT 7
    `).all(employeeId);
    res.json({ history });
  });

  app.post("/api/attendance", (req, res) => {
    const { employeeId, status, lat, lng, notes } = req.body;
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const time = now.toLocaleTimeString("en-GB", { hour12: false });

    // Check if already attended today
    const existing = db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND date = ?").get(employeeId, today);
    if (existing) {
      return res.status(400).json({ success: false, message: "Anda sudah melakukan absensi hari ini" });
    }

    try {
      db.prepare(`
        INSERT INTO attendance (employee_id, date, time, status, location_lat, location_lng, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(employeeId, today, time, status, lat, lng, notes);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: "Gagal menyimpan absensi" });
    }
  });

  // Admin Routes
  app.get("/api/admin/employees", (req, res) => {
    const employees = db.prepare("SELECT * FROM employees").all();
    res.json({ employees });
  });

  app.post("/api/admin/employees/import", (req, res) => {
    try {
      const { employees } = req.body;
      if (!Array.isArray(employees) || employees.length === 0) {
        return res.status(400).json({ success: false, message: "Data karyawan kosong atau tidak valid" });
      }

      const insert = db.prepare("INSERT OR REPLACE INTO employees (id, name, position, department, role) VALUES (?, ?, ?, ?, ?)");
      const transaction = db.transaction((data) => {
        for (const emp of data) {
          insert.run(emp.id, emp.name, emp.position, emp.department, emp.role || 'employee');
        }
      });
      transaction(employees);
      res.json({ success: true });
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({ success: false, message: "Gagal mengimpor data ke database" });
    }
  });

  app.get("/api/admin/reports/daily", (req, res) => {
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const report = db.prepare(`
      SELECT e.id, e.name, e.department, a.time, a.status, a.notes
      FROM employees e
      LEFT JOIN attendance a ON e.id = a.employee_id AND a.date = ?
      WHERE e.role != 'admin'
    `).all(date);
    res.json({ report });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

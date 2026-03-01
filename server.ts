import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use /data folder for persistent storage on Railway, fallback to local __dirname
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "kresna_absen.db");
const db = new Database(dbPath);

console.log(`-----------------------------------------`);
console.log(`DATABASE STATUS:`);
console.log(`Path: ${dbPath}`);
console.log(`Persistent: ${dataDir.includes('/data') ? 'YES (Railway Volume)' : 'NO (Local Storage)'}`);
console.log(`-----------------------------------------`);

console.log(`Using database at: ${dbPath}`);

const getLocalDate = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jayapura',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
};

const getLocalTime = () => {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jayapura',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
};

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position TEXT,
    department TEXT,
    role TEXT DEFAULT 'employee',
    device_id TEXT
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

// Ensure device_id column exists for existing databases
try {
  db.exec("ALTER TABLE employees ADD COLUMN device_id TEXT");
} catch (e) {
  // Column already exists or other error
}

// Insert or update default admin

// Insert or update default admin
const admin = db.prepare("SELECT * FROM employees WHERE id = 'ADMIN123'").get();
if (!admin) {
  db.prepare("INSERT INTO employees (id, name, position, department, role) VALUES (?, ?, ?, ?, ?)").run(
    "ADMIN123", "SIGIT HARIYADI, S.I.K., M.H.", "Admin Utama", "Pimpinan", "admin"
  );
} else if (admin.role === 'admin') {
  db.prepare("UPDATE employees SET name = ?, position = ?, department = ? WHERE id = 'ADMIN123'").run(
    "SIGIT HARIYADI, S.I.K., M.H.", "Admin Utama", "Pimpinan"
  );
}

const employeeCount = db.prepare("SELECT COUNT(*) as count FROM employees").get() as { count: number };
console.log(`Database initialized. Total employees: ${employeeCount.count}`);

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.post("/api/login", (req, res) => {
    const { employeeId, deviceId } = req.body;
    const employee = db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId) as any;
    
    if (!employee) {
      return res.status(401).json({ success: false, message: "ID Karyawan tidak terdaftar" });
    }

    // Admin bypass device check
    if (employee.role === 'admin') {
      return res.json({ success: true, employee });
    }

    if (!deviceId) {
      return res.status(400).json({ success: false, message: "Device ID diperlukan" });
    }

    // Device binding logic
    if (!employee.device_id) {
      // First time login, bind device
      db.prepare("UPDATE employees SET device_id = ? WHERE id = ?").run(deviceId, employeeId);
      employee.device_id = deviceId;
      return res.json({ success: true, employee, message: "Perangkat berhasil didaftarkan" });
    } else if (employee.device_id !== deviceId) {
      // Device mismatch
      return res.status(403).json({ 
        success: false, 
        message: "ID ini sudah terdaftar di HP lain. Silakan hubungi Admin untuk reset perangkat." 
      });
    }

    res.json({ success: true, employee });
  });

  app.post("/api/admin/reset-device", (req, res) => {
    const { employeeId } = req.body;
    try {
      db.prepare("UPDATE employees SET device_id = NULL WHERE id = ?").run(employeeId);
      res.json({ success: true, message: "Perangkat berhasil di-reset" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Gagal me-reset perangkat" });
    }
  });

  app.get("/api/attendance/today/:employeeId", (req, res) => {
    const { employeeId } = req.params;
    const today = getLocalDate();
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
    const today = getLocalDate();
    const time = getLocalTime();

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
    const date = req.query.date || getLocalDate();
    const report = db.prepare(`
      SELECT e.id, e.name, e.department, e.device_id, a.time, a.status, a.notes
      FROM employees e
      LEFT JOIN attendance a ON e.id = a.employee_id AND a.date = ?
      WHERE e.role != 'admin'
    `).all(date);
    res.json({ report });
  });

  app.get("/api/admin/reports/all", (req, res) => {
    try {
      const report = db.prepare(`
        SELECT a.date, a.time, e.id as employee_id, e.name, e.position, e.department, a.status, a.notes
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        ORDER BY a.date DESC, a.time DESC
      `).all();
      res.json({ report });
    } catch (error) {
      res.status(500).json({ success: false });
    }
  });

  app.get("/api/admin/stats", (req, res) => {
    try {
      const empCount = db.prepare("SELECT COUNT(*) as count FROM employees").get() as { count: number };
      const attCount = db.prepare("SELECT COUNT(*) as count FROM attendance").get() as { count: number };
      res.json({ 
        employeeCount: empCount.count, 
        attendanceCount: attCount.count,
        dbPath: dbPath
      });
    } catch (error) {
      res.status(500).json({ success: false });
    }
  });

  app.get("/api/admin/backup", (req, res) => {
    if (fs.existsSync(dbPath)) {
      res.download(dbPath, `backup_absen_${getLocalDate()}.db`);
    } else {
      res.status(404).json({ success: false, message: "File database tidak ditemukan" });
    }
  });

  // Vite middleware for development (only if explicitly set to development)
  if (process.env.NODE_ENV === "development") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Default to production mode
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = process.env.PORT || 3000;
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

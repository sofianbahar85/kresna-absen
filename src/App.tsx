import React, { useState, useEffect } from 'react';
import { 
  LogIn, 
  MapPin, 
  Clock, 
  User, 
  LogOut, 
  Calendar, 
  FileText, 
  Upload, 
  CheckCircle, 
  XCircle, 
  Shield,
  Download,
  Share2,
  Smartphone,
  Database
} from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Employee, Attendance, DailyReportItem } from './types';
import { OFFICE_LOCATIONS, ATTENDANCE_TIME, ABSENCE_REASONS } from './constants';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const getDeviceId = () => {
  let deviceId = localStorage.getItem('kresna_device_id');
  if (!deviceId) {
    deviceId = 'DEV-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('kresna_device_id', deviceId);
  }
  return deviceId;
};

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'outline' }) => {
  const variants = {
    primary: 'bg-blue-900 text-white hover:bg-blue-800',
    secondary: 'bg-blue-600 text-white hover:bg-blue-500',
    danger: 'bg-red-600 text-white hover:bg-red-500',
    outline: 'border-2 border-blue-900 text-blue-900 hover:bg-blue-50',
  };

  return (
    <button 
      className={cn(
        'px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void; key?: React.Key }) => (
  <div 
    onClick={onClick}
    className={cn('bg-white rounded-2xl shadow-sm border border-gray-100 p-4', className, onClick && 'cursor-pointer')}
  >
    {children}
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<Employee | null>(null);
  const [view, setView] = useState<'login' | 'dashboard' | 'admin'>('login');
  const [isInitializing, setIsInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  // Admin states
  const [reportDate, setReportDate] = useState(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jayapura',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  });
  const [dailyReport, setDailyReport] = useState<DailyReportItem[]>([]);
  const [dbStats, setDbStats] = useState<{ employeeCount: number; attendanceCount: number } | null>(null);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('kresna_user');
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        if (parsedUser && typeof parsedUser === 'object') {
          setUser(parsedUser);
          setView(parsedUser.role === 'admin' ? 'admin' : 'dashboard');
        }
      }
    } catch (e) {
      console.error("Failed to load user from localStorage", e);
      localStorage.removeItem('kresna_user');
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    // Auto-restore data on startup if database is empty
    const autoRestoreOnStartup = async () => {
      try {
        const res = await fetch('/api/admin/stats');
        if (res.ok) {
          const stats = await res.json();
          setDbStats(stats);
          // If only admin exists (count <= 1), try to restore from cache
          if (stats.employeeCount <= 1) {
            const cached = localStorage.getItem('kresna_employees_cache');
            if (cached) {
              console.log("Startup: Database empty, auto-restoring from browser cache...");
              const employees = JSON.parse(cached);
              await fetch('/api/admin/employees/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employees }),
              });
              // Refresh stats after restore
              const newRes = await fetch('/api/admin/stats');
              const newStats = await newRes.json();
              setDbStats(newStats);
            }
          }
        }
      } catch (e) {
        console.error("Auto-restore check failed", e);
      }
    };

    autoRestoreOnStartup();
  }, []);

  useEffect(() => {
    if (user && view === 'dashboard') {
      fetchTodayAttendance();
      fetchHistory();
      requestLocation();
    }
    if (user && view === 'admin') {
      fetchDailyReport();
      fetchDbStats();
    }
  }, [user, view, reportDate]);

  const fetchTodayAttendance = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/attendance/today/${user.id}`);
      const data = await res.json();
      setTodayAttendance(data.attendance);
    } catch (e) {
      console.error("Failed to fetch today attendance", e);
    }
  };

  const fetchHistory = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/attendance/history/${user.id}`);
      const data = await res.json();
      setHistory(data.history || []);
    } catch (e) {
      console.error("Failed to fetch history", e);
    }
  };

  const fetchDailyReport = async () => {
    try {
      const res = await fetch(`/api/admin/reports/daily?date=${reportDate}`);
      const data = await res.json();
      setDailyReport(data.report || []);
      fetchDbStats();
    } catch (e) {
      console.error("Failed to fetch daily report", e);
    }
  };

  const fetchDbStats = async () => {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      setDbStats(data);
    } catch (e) {
      console.error("Failed to fetch stats", e);
    }
  };

  const handleRestoreFromCache = async (silent = false) => {
    const cached = localStorage.getItem('kresna_employees_cache');
    if (!cached) return;
    
    try {
      const employees = JSON.parse(cached);
      if (!silent) setLoading(true);
      const res = await fetch('/api/admin/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees }),
      });
      const data = await res.json();
      if (data.success) {
        if (!silent) alert("Data karyawan berhasil dipulihkan dari cache browser.");
        fetchDailyReport();
      }
    } catch (e) {
      if (!silent) alert("Gagal memulihkan data.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const getCurrentOfficeLocation = () => {
    const day = new Date().getDay(); // 0: Minggu, 1: Senin, 2: Selasa, 3: Rabu, 4: Kamis, 5: Jumat, 6: Sabtu
    return day === 3 ? OFFICE_LOCATIONS.wednesday : OFFICE_LOCATIONS.default;
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation tidak didukung oleh browser ini.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ lat: latitude, lng: longitude });
        
        const office = getCurrentOfficeLocation();
        
        // Calculate distance (Haversine formula)
        const R = 6371e3; // metres
        const φ1 = latitude * Math.PI/180;
        const φ2 = office.lat * Math.PI/180;
        const Δφ = (office.lat - latitude) * Math.PI/180;
        const Δλ = (office.lng - longitude) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        const d = R * c;
        setDistance(d);
      },
      (err) => {
        setError("Gagal mendapatkan lokasi. Pastikan GPS aktif.");
      }
    );
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const employeeId = formData.get('employeeId');
    const deviceId = getDeviceId();

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, deviceId }),
      });
      const data = await res.json();

      if (data.success) {
        setUser(data.employee);
        localStorage.setItem('kresna_user', JSON.stringify(data.employee));
        setView(data.employee.role === 'admin' ? 'admin' : 'dashboard');
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setView('login');
    localStorage.removeItem('kresna_user');
  };

  const submitAttendance = async (status: string, notes: string = "") => {
    if (!user) return;
    
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) {
      setError("Hari ini adalah hari libur (Sabtu/Minggu). Absensi tidak tersedia.");
      return;
    }

    setLoading(true);
    setError(null);

    // Time validation for 'Hadir'
    if (status === 'Hadir') {
      const now = new Date();
      const currentTime = format(now, 'HH:mm');
      
      if (currentTime < ATTENDANCE_TIME.start) {
        setError("Belum waktu absensi (Mulai 07:30)");
        setLoading(false);
        return;
      }
      
      if (currentTime > ATTENDANCE_TIME.end) {
        setError("Waktu absensi hadir sudah berakhir (Batas 09:00)");
        setLoading(false);
        return;
      }

      const office = getCurrentOfficeLocation();
      if (distance === null || distance > office.radius) {
        setError(`Anda berada di luar radius kantor (${distance ? Math.round(distance) : '?'}m).`);
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: user.id,
          status,
          lat: location?.lat,
          lng: location?.lng,
          notes
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchTodayAttendance();
        fetchHistory();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Gagal mengirim absensi");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminManualAttendance = async (employeeId: string, status: string) => {
    if (user?.name !== 'SIGIT HARIYADI, S.I.K., M.H.') {
      alert("Hanya SIGIT HARIYADI, S.I.K., M.H. yang dapat melakukan absen manual.");
      return;
    }
    
    if (!confirm(`Konfirmasi absen ${status} untuk karyawan ini?`)) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          status,
          notes: "Absen manual oleh Admin"
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchDailyReport();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Gagal melakukan absen manual");
    } finally {
      setLoading(false);
    }
  };

  const handleResetDevice = async (employeeId: string, employeeName: string) => {
    if (!confirm(`Reset perangkat untuk ${employeeName}? Karyawan ini akan bisa login dari HP baru.`)) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/admin/reset-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Perangkat berhasil di-reset");
        fetchDailyReport();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Gagal me-reset perangkat");
    } finally {
      setLoading(false);
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (jsonData.length === 0) {
          alert("File Excel kosong");
          return;
        }

        const formattedEmployees = jsonData.map(row => {
          // Helper to find value by case-insensitive key
          const getValue = (possibleKeys: string[]) => {
            const key = Object.keys(row).find(k => 
              possibleKeys.some(pk => k.toLowerCase().trim() === pk.toLowerCase())
            );
            return key ? String(row[key]).trim() : '';
          };

          return {
            id: getValue(['Nomor ID', 'id', 'ID Karyawan', 'NIK']),
            name: getValue(['Nama Karyawan', 'name', 'Nama', 'Full Name']),
            position: getValue(['Jabatan', 'position', 'Role', 'Title']),
            department: getValue(['Unit/Bagian', 'department', 'Unit', 'Bagian', 'Dept']),
            role: 'employee'
          };
        }).filter(emp => emp.id && emp.name);

        if (formattedEmployees.length === 0) {
          alert("Tidak ditemukan data karyawan yang valid. Pastikan kolom 'Nomor ID' dan 'Nama Karyawan' tersedia.");
          return;
        }

        const res = await fetch('/api/admin/employees/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employees: formattedEmployees }),
        });
        
        const result = await res.json();
        if (res.ok && result.success) {
          localStorage.setItem('kresna_employees_cache', JSON.stringify(formattedEmployees));
          alert(`Berhasil mengimpor ${formattedEmployees.length} karyawan!`);
          fetchDailyReport();
        } else {
          alert(result.message || "Gagal mengimpor data");
        }
      } catch (err) {
        console.error("Excel parse error:", err);
        alert("Gagal membaca file Excel. Pastikan format file benar.");
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const generatePDF = () => {
    const reportDay = new Date(reportDate).getDay();
    if (reportDay === 0 || reportDay === 6) {
      alert("Tidak dapat membuat laporan untuk hari libur (Sabtu/Minggu).");
      return;
    }

    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138); // Navy
    doc.text("Kresna Absen", 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`Laporan Rekap Absensi Harian - ${reportDate}`, 105, 30, { align: 'center' });

    // Summary Section
    const stats = {
      total: dailyReport.length,
      hadir: dailyReport.filter(i => i.status === 'Hadir').length,
      kurang: dailyReport.filter(i => !i.status).length,
      sakit: dailyReport.filter(i => i.status === 'Sakit').length,
      dinas: dailyReport.filter(i => i.status === 'Dinas').length,
      dinasLuar: dailyReport.filter(i => i.status === 'Dinas Luar').length,
      ijin: dailyReport.filter(i => i.status === 'Ijin').length,
      lepasDinas: dailyReport.filter(i => i.status === 'Lepas Dinas').length,
      cuti: dailyReport.filter(i => i.status === 'Cuti').length,
    };

    doc.setFontSize(10);
    doc.text(`Ringkasan Kehadiran:`, 14, 45);
    doc.text(`- Jumlah Karyawan : ${stats.total}`, 20, 52);
    doc.text(`- Hadir           : ${stats.hadir}`, 20, 58);
    doc.text(`- Kurang (Belum)  : ${stats.kurang}`, 20, 64);

    doc.text(`Keterangan Lainnya:`, 100, 45);
    doc.text(`- Sakit           : ${stats.sakit}`, 106, 52);
    doc.text(`- Dinas           : ${stats.dinas}`, 106, 58);
    doc.text(`- Dinas Luar      : ${stats.dinasLuar}`, 106, 64);
    doc.text(`- Ijin            : ${stats.ijin}`, 106, 70);
    doc.text(`- Lepas Dinas     : ${stats.lepasDinas}`, 106, 76);
    doc.text(`- Cuti            : ${stats.cuti}`, 106, 82);
    doc.text(`- Tanpa Ket.      : ${stats.kurang}`, 106, 88);

    const tableData = dailyReport.map((item, index) => [
      index + 1,
      item.id,
      item.name,
      item.department,
      item.status || 'Tidak Absen',
      item.time || '-',
      item.notes || '-'
    ]);

    autoTable(doc, {
      startY: 90,
      head: [['No', 'ID', 'Nama', 'Unit', 'Status', 'Waktu', 'Ket']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
    });

    const fileName = `Rekap_Absen_${reportDate}.pdf`;
    doc.save(fileName);

    const message = `*REKAP ABSENSI KRESNA ABSEN*
Tanggal: ${reportDate}

*Ringkasan:*
- Total Karyawan: ${stats.total}
- Hadir: ${stats.hadir}
- Kurang Keterangan (Belum Absen): ${stats.kurang}

*Keterangan Lainnya:*
- Sakit: ${stats.sakit}
- Ijin: ${stats.ijin}
- Dinas: ${stats.dinas}
- Dinas Luar: ${stats.dinasLuar}
- Lepas Dinas: ${stats.lepasDinas}
- Cuti: ${stats.cuti}

_Laporan lengkap tersedia dalam format PDF._`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  // --- Views ---

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-blue-900 flex items-center justify-center">
        <div className="text-white flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-sm font-medium">Memuat Aplikasi...</p>
        </div>
      </div>
    );
  }

  if (view === 'login' || !user) {
    return (
      <div className="min-h-screen bg-blue-900 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="bg-blue-800 p-8 text-center text-white">
            <div className="w-20 h-20 bg-white/20 rounded-2xl mx-auto flex items-center justify-center mb-4 backdrop-blur-sm">
              <Shield size={40} />
            </div>
            <h1 className="text-2xl font-bold">Kresna Absen</h1>
            <p className="text-blue-100 text-sm mt-1">Sistem Absensi Karyawan</p>
          </div>
          
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">ID Karyawan</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input 
                  name="employeeId"
                  type="text" 
                  required
                  placeholder="Masukkan ID Anda"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <XCircle size={16} />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full py-4 text-lg" disabled={loading}>
              {loading ? "Memproses..." : "Masuk"}
              {!loading && <LogIn size={20} />}
            </Button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (view === 'dashboard' && user) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* Header */}
        <div className="bg-blue-900 text-white p-6 rounded-b-[2.5rem] shadow-lg">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-blue-200 text-sm">Selamat Datang,</p>
              <h2 className="text-2xl font-bold">{user.name}</h2>
              <p className="text-blue-300 text-xs mt-1">{user.position} • {user.department}</p>
            </div>
            <button onClick={handleLogout} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors">
              <LogOut size={20} />
            </button>
          </div>

          <Card className="bg-white/10 border-none backdrop-blur-md text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/30 rounded-lg">
                  <Calendar size={20} />
                </div>
                <div>
                  <p className="text-xs text-blue-200">Hari Ini</p>
                  <p className="font-semibold">
                    {new Intl.DateTimeFormat('id-ID', { 
                      timeZone: 'Asia/Jayapura', 
                      dateStyle: 'full' 
                    }).format(new Date())}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-blue-200">Status</p>
                <p className={cn(
                  "font-bold",
                  todayAttendance ? "text-green-400" : "text-amber-400"
                )}>
                  {todayAttendance ? todayAttendance.status : "Belum Absen"}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="p-6 space-y-6 -mt-4">
          {/* Main Action */}
          {!todayAttendance ? (
            <Card className="p-6 text-center space-y-4 border-2 border-blue-100">
              <div className="flex justify-center gap-8 mb-2">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-1">
                    <Clock className="text-blue-600" size={24} />
                  </div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Waktu</p>
                  <p className="text-sm font-bold text-gray-700">{ATTENDANCE_TIME.start} - {ATTENDANCE_TIME.end}</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-1">
                    <MapPin className="text-blue-600" size={24} />
                  </div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Radius</p>
                  <p className="text-sm font-bold text-gray-700">{getCurrentOfficeLocation().radius}m</p>
                </div>
              </div>

              <div className="space-y-3">
                <Button 
                  className="w-full py-4 text-xl rounded-2xl shadow-blue-200 shadow-lg"
                  onClick={() => submitAttendance('Hadir')}
                  disabled={loading}
                >
                  {loading ? "Mengirim..." : "ABSEN HADIR"}
                </Button>
                
                <div className="grid grid-cols-2 gap-3">
                  {ABSENCE_REASONS.map(reason => (
                    <Button 
                      key={reason}
                      variant="outline" 
                      className="text-sm py-3"
                      onClick={() => submitAttendance(reason)}
                      disabled={loading}
                    >
                      {reason}
                    </Button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-red-500 text-xs font-medium bg-red-50 p-2 rounded-lg">{error}</p>
              )}
            </Card>
          ) : (
            <Card className="bg-green-50 border-green-100 p-6 text-center">
              <div className="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-200">
                <CheckCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-green-800">Absensi Berhasil!</h3>
              <p className="text-green-600 text-sm mt-1">
                Anda telah melakukan absen {todayAttendance.status} pada pukul {todayAttendance.time}
              </p>
            </Card>
          )}

          {/* History */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800">Riwayat 7 Hari Terakhir</h3>
              <Calendar size={18} className="text-gray-400" />
            </div>
            <div className="space-y-3">
              {history.length > 0 ? history.map((item) => (
                <Card key={item.id} className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      item.status === 'Hadir' ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                    )}>
                      {item.status === 'Hadir' ? <CheckCircle size={20} /> : <FileText size={20} />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{item.status}</p>
                      <p className="text-[10px] text-gray-500">{format(new Date(item.date), 'dd MMMM yyyy')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-gray-700">{item.time}</p>
                    <p className="text-[10px] text-gray-400">WIT</p>
                  </div>
                </Card>
              )) : (
                <p className="text-center text-gray-400 text-sm py-8">Belum ada riwayat absensi</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'admin' && user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-blue-900 text-white p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-xl">
                <Shield size={24} />
              </div>
              <h1 className="text-xl font-bold">Panel Admin</h1>
            </div>
            <button onClick={handleLogout} className="p-2 bg-white/10 rounded-xl">
              <LogOut size={20} />
            </button>
          </div>
          
          {dbStats && (
            <div className="flex flex-wrap gap-2 mt-4 text-[10px]">
              <div className="bg-white/10 px-3 py-1 rounded-full text-blue-100">
                Total Karyawan: <span className="font-bold text-white">{dbStats.employeeCount}</span>
              </div>
              <div className="bg-white/10 px-3 py-1 rounded-full text-blue-100">
                Total Absensi: <span className="font-bold text-white">{dbStats.attendanceCount}</span>
              </div>
              {localStorage.getItem('kresna_employees_cache') && (
                <div className="bg-green-500/20 px-3 py-1 rounded-full text-green-200 flex items-center gap-1">
                  <CheckCircle size={10} />
                  <span>Data Tersimpan di Browser</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 flex flex-col items-center justify-center gap-2 text-center cursor-pointer hover:bg-blue-50 transition-colors relative">
              <Upload className="text-blue-600" size={24} />
              <p className="text-xs font-bold text-gray-700">Import Excel</p>
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                onChange={handleImportExcel}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </Card>
            <Card 
              className="p-4 flex flex-col items-center justify-center gap-2 text-center cursor-pointer hover:bg-blue-50 transition-colors"
              onClick={generatePDF}
            >
              <Download className="text-blue-600" size={24} />
              <p className="text-xs font-bold text-gray-700">Download PDF</p>
            </Card>
            <Card 
              className="p-4 flex flex-col items-center justify-center gap-2 text-center cursor-pointer hover:bg-blue-50 transition-colors"
              onClick={() => window.open('/api/admin/backup', '_blank')}
            >
              <Database className="text-blue-600" size={24} />
              <p className="text-xs font-bold text-gray-700">Backup DB</p>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-800">Rekap Harian</h3>
                <button 
                  onClick={fetchDailyReport}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                  title="Refresh Data"
                >
                  <Share2 size={14} className="rotate-180" />
                </button>
              </div>
              <input 
                type="date" 
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="text-xs border rounded-lg p-1 outline-none"
              />
            </div>
            
            <div className="overflow-x-auto">
              {(new Date(reportDate).getDay() === 0 || new Date(reportDate).getDay() === 6) ? (
                <div className="py-12 text-center">
                  <Calendar className="mx-auto text-gray-300 mb-2" size={48} />
                  <p className="text-gray-500 font-medium">Hari Libur (Sabtu/Minggu)</p>
                  <p className="text-gray-400 text-xs">Tidak ada jadwal kerja pada hari ini.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-gray-400">
                      <th className="pb-2 font-medium">Nama</th>
                      <th className="pb-2 font-medium">Unit</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Waktu</th>
                      {user?.name === 'SIGIT HARIYADI, S.I.K., M.H.' && <th className="pb-2 font-medium text-right">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dailyReport.map((item) => {
                      const todayStr = new Intl.DateTimeFormat('en-CA', {
                        timeZone: 'Asia/Jayapura',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                      }).format(new Date());

                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="py-3 font-bold text-gray-800">{item.name}</td>
                          <td className="py-3 text-gray-500">{item.department}</td>
                          <td className="py-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold",
                              item.status === 'Hadir' ? "bg-green-100 text-green-700" : 
                              item.status ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                            )}>
                              {item.status || 'Belum Absen'}
                            </span>
                          </td>
                          <td className="py-3 text-gray-600">{item.time || '-'}</td>
                          {user?.name === 'SIGIT HARIYADI, S.I.K., M.H.' && (
                            <td className="py-3 text-right">
                              <div className="flex justify-end gap-1">
                                {item.device_id && (
                                  <button 
                                    onClick={() => handleResetDevice(item.id, item.name)}
                                    className="p-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                                    title="Reset Perangkat"
                                  >
                                    <Smartphone size={14} />
                                  </button>
                                )}
                                {!item.status && reportDate === todayStr && (
                                  <>
                                    <button 
                                      onClick={() => handleAdminManualAttendance(item.id, 'Hadir')}
                                      className="p-1 bg-green-50 text-green-600 rounded hover:bg-green-100"
                                      title="Absen Hadir"
                                    >
                                      <CheckCircle size={14} />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        const reason = prompt("Masukkan alasan (Sakit/Ijin/Dinas/Cuti):", "Ijin");
                                        if (reason) handleAdminManualAttendance(item.id, reason);
                                      }}
                                      className="p-1 bg-amber-50 text-amber-600 rounded hover:bg-amber-100"
                                      title="Absen Lainnya"
                                    >
                                      <FileText size={14} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {dailyReport.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center">
                          <Upload className="mx-auto text-gray-300 mb-2" size={32} />
                          <p className="text-gray-500 font-medium">Data Karyawan Kosong</p>
                          <p className="text-gray-400 text-[10px] max-w-[200px] mx-auto mb-4">Silakan import daftar karyawan melalui tombol "Import Excel" di atas.</p>
                          
                          {localStorage.getItem('kresna_employees_cache') && (
                            <Button 
                              variant="outline" 
                              className="text-[10px] py-1 px-3 mx-auto"
                              onClick={handleRestoreFromCache}
                              disabled={loading}
                            >
                              Pulihkan dari Cache Browser
                            </Button>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </Card>

          <Button variant="outline" className="w-full" onClick={generatePDF}>
            <Share2 size={18} />
            Bagikan ke WhatsApp
          </Button>
        </div>
      </div>
    );
  }

  // Fallback to login if something goes wrong
  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center p-6">
      <div className="text-white text-center">
        <p>Terjadi kesalahan saat memuat halaman.</p>
        <Button onClick={() => setView('login')} className="mt-4 bg-white text-blue-900">
          Kembali ke Login
        </Button>
      </div>
    </div>
  );
}

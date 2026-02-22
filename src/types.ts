export interface Employee {
  id: string;
  name: string;
  position: string;
  department: string;
  role: 'admin' | 'employee';
}

export interface Attendance {
  id: number;
  employee_id: string;
  date: string;
  time: string;
  status: 'Hadir' | 'Sakit' | 'Ijin' | 'Dinas' | 'Lepas Dinas' | 'Cuti';
  location_lat?: number;
  location_lng?: number;
  notes?: string;
}

export interface DailyReportItem {
  id: string;
  name: string;
  department: string;
  time: string | null;
  status: string | null;
  notes: string | null;
}

export interface Employee {
  id: string;
  name: string;
  employee_code: string;
  device_name: string | null;
  api_key: string;
  status: 'online' | 'idle' | 'offline';
  current_app: string | null;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
  screenshot_enabled?: boolean;
  screenshot_interval?: number;
  capture_requested_at?: string | null;
}

export interface ActivityLog {
  id: string;
  employee_id: string;
  app_name: string;
  window_title?: string | null;
  website_domain?: string | null;
  status: 'working' | 'unproductive' | 'idle';
  duration_seconds: number;
  created_at: string;
}

export interface Screenshot {
  id: string;
  employee_id: string;
  image_path: string;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface EmployeeWithStats extends Employee {
  total_working_time?: number;
  total_idle_time?: number;
  activity_logs?: ActivityLog[];
}

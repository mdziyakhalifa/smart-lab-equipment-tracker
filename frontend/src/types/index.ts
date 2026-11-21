export type Role = "admin" | "lab_assistant" | "student" | "faculty";

export interface User {
  id: number;
  full_name: string;
  email: string;
  username: string;
  role: Role;
  department?: string | null;
  identifier?: string | null;
  phone?: string | null;
  is_active: boolean;
  last_login_at?: string | null;
  created_at: string;
}

export interface UserBrief {
  id: number;
  full_name: string;
  email: string;
  role: Role;
}

export interface Category {
  id: number;
  name: string;
  description?: string | null;
}

export interface Laboratory {
  id: number;
  name: string;
  code: string;
  building?: string | null;
  room?: string | null;
  description?: string | null;
  contact_person?: string | null;
  equipment_count?: number;
}

export interface Asset {
  id: number;
  equipment_id: number;
  asset_code: string;
  serial_number?: string | null;
  condition: string;
  status: string;
  notes?: string | null;
}

export interface Equipment {
  id: number;
  asset_tag: string;
  name: string;
  category_id: number;
  laboratory_id: number;
  description?: string | null;
  manufacturer?: string | null;
  model_number?: string | null;
  serial_number?: string | null;
  quantity: number;
  available_quantity: number;
  purchase_date?: string | null;
  purchase_price?: number | null;
  condition: string;
  status: string;
  calibration_required: boolean;
  last_calibration_date?: string | null;
  next_calibration_date?: string | null;
  maintenance_status: string;
  image_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: Category | null;
  laboratory?: Laboratory | null;
  assets?: Asset[];
  availability_status: string;
}

export interface EquipmentBrief {
  id: number;
  asset_tag: string;
  name: string;
  status: string;
  category?: Category | null;
  laboratory?: Laboratory | null;
  category_name?: string | null;
  laboratory_name?: string | null;
}

export interface Availability {
  equipment_id: number;
  total_quantity: number;
  available_quantity: number;
  borrowed_quantity: number;
  reserved_quantity: number;
  damaged_quantity: number;
  maintenance_quantity: number;
  condition: string;
  location: string;
  status: string;
  next_calibration_date?: string | null;
  checked_date?: string | null;
  checked_start_time?: string | null;
  checked_end_time?: string | null;
}

export interface BorrowingAsset {
  id: number;
  asset: Asset;
  returned_at?: string | null;
}

export interface Borrowing {
  id: number;
  transaction_code: string;
  user_id: number;
  equipment_id: number;
  asset_id?: number | null;
  quantity: number;
  purpose?: string | null;
  request_date: string;
  approval_date?: string | null;
  issue_date?: string | null;
  expected_return_date: string;
  actual_return_date?: string | null;
  status: string;
  return_condition?: string | null;
  rejection_reason?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  user: UserBrief;
  equipment: EquipmentBrief;
  approved_by?: UserBrief | null;
  issued_by?: UserBrief | null;
  asset?: Asset | null;
  borrowed_assets: BorrowingAsset[];
  is_overdue: boolean;
}

export interface Reservation {
  id: number;
  reservation_code: string;
  user_id: number;
  equipment_id: number;
  quantity: number;
  reservation_date: string;
  start_time: string;
  end_time: string;
  purpose?: string | null;
  status: string;
  decision_note?: string | null;
  created_at: string;
  updated_at: string;
  user: UserBrief;
  equipment: EquipmentBrief;
  approved_by?: UserBrief | null;
}

export interface DamageReport {
  id: number;
  report_code: string;
  equipment_id: number;
  asset_id?: number | null;
  reported_by_id: number;
  issue_category: string;
  description: string;
  image_url?: string | null;
  priority: string;
  status: string;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
  equipment: EquipmentBrief;
  asset?: Asset | null;
  reporter: UserBrief;
  reviewed_by?: UserBrief | null;
}

export interface MaintenanceRecord {
  id: number;
  maintenance_code: string;
  equipment_id: number;
  asset_id?: number | null;
  maintenance_type: string;
  title: string;
  description?: string | null;
  scheduled_date: string;
  started_at?: string | null;
  completed_at?: string | null;
  status: string;
  technician?: string | null;
  service_provider?: string | null;
  cost?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  equipment: EquipmentBrief;
  asset?: Asset | null;
  created_by?: UserBrief | null;
}

export interface CalibrationRecord {
  id: number;
  calibration_code: string;
  equipment_id: number;
  calibration_date: string;
  next_due_date: string;
  result: string;
  technician?: string | null;
  service_provider?: string | null;
  notes?: string | null;
  created_at: string;
  equipment: EquipmentBrief;
  created_by?: UserBrief | null;
}

export interface CalibrationScheduleItem {
  equipment_id: number;
  asset_tag: string;
  name: string;
  category?: string | null;
  laboratory?: string | null;
  last_calibration_date?: string | null;
  next_calibration_date: string;
  days_until: number;
  calibration_status: "overdue" | "due_soon" | "upcoming";
  condition: string;
  status: string;
}

export interface Consumable {
  id: number;
  name: string;
  category: string;
  description?: string | null;
  quantity: number;
  unit: string;
  minimum_stock: number;
  laboratory_id?: number | null;
  supplier?: string | null;
  unit_price?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  laboratory?: Laboratory | null;
  is_low_stock: boolean;
}

export interface ConsumableTransaction {
  id: number;
  consumable_id: number;
  transaction_type: string;
  quantity: number;
  balance_after: number;
  note?: string | null;
  created_at: string;
  user: UserBrief;
}

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  action: string;
  entity_type?: string | null;
  entity_id?: number | null;
  details?: string | null;
  created_at: string;
  user?: UserBrief | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface DashboardSummary {
  role: Role;
  stats: Record<string, number>;
  charts: {
    status_distribution: { name: string; status: string; value: number }[];
    category_distribution: { name: string; value: number }[];
    monthly_borrowings: { month: string; key: string; requests: number; returns: number }[];
  };
  recent_borrowings: Borrowing[];
  pending_requests: Borrowing[];
  return_queue: Borrowing[];
  my_borrowings: Borrowing[];
  upcoming_returns: Borrowing[];
  my_reservations: Reservation[];
  recent_maintenance: MaintenanceRecord[];
  upcoming_maintenance: MaintenanceRecord[];
  calibration_due: (EquipmentBrief & {
    next_calibration_date?: string | null;
    last_calibration_date?: string | null;
    days_until?: number | null;
    calibration_status: string;
  })[];
  low_stock_items: Consumable[];
  recent_equipment: Equipment[];
  damage_reports: DamageReport[];
  recent_activity: ActivityLog[];
  generated_at: string;
}

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportPreview {
  title: string;
  report_type: string;
  generated_at: string;
  filters: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  total: number;
  truncated: boolean;
}

export interface SystemInfo {
  name: string;
  version: string;
  demo_mode: boolean;
  scheduler_enabled: boolean;
  database: string;
  server_time: string;
  counts: { users: number; equipment: number };
}

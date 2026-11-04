import { request } from './request';
import type { MiniUser } from '@/stores/auth';

export interface Paged<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
}

export interface ReviewItem {
  id: number;
  record_id: number;
  score: number | string;
  level: string;
  risk: number;
  issues: any[];
  issueCount: number;
  model: string;
  created_at: string;
  patient_name: string;
  mrn: string;
  dept_name?: string;
  doctor_name?: string;
  record_status: string;
}

export interface TaskItem {
  id: number;
  record_id: number;
  report_id: number | null;
  status: 'open' | 'submitted' | 'passed' | 'closed';
  due_at: string;
  note?: string;
  patient_name: string;
  mrn: string;
  diagnosis: string;
  record_status: string;
  dept_name?: string;
  doctor_name?: string;
  overdue: number;
}

export interface TaskPaged extends Paged<TaskItem> {
  summary: { pending: number; overdue: number; passed: number };
}

export interface RecordRow {
  id: number;
  patient_name: string;
  gender: string;
  mrn: string;
  dept_name?: string;
  doctor_name?: string;
  diagnosis: string;
  status: string;
  qc_score?: number | string | null;
  qc_level?: string | null;
  qc_final_score?: number | string | null;
  qc_review_status?: string | null;
  score_delta?: number | string | null;
  open_task_id?: number | null;
  task_due_at?: string | null;
  updated_at: string;
}

export interface QCIssue {
  ruleCode: string;
  rule: string;
  severity: 'critical' | 'major' | 'minor';
  field: string;
  message: string;
  suggestion: string;
}

export interface LatestQC {
  id: number;
  score: number | string;
  level: string;
  dim_completeness: number | string;
  dim_accuracy: number | string;
  dim_logic: number | string;
  dim_terminology: number | string;
  risk: number;
  issues: QCIssue[] | string;
  suggestions: string[] | string;
  summary: string;
  model: string;
  duration_ms?: number;
  prev_score?: number | string | null;
  score_delta?: number | string | null;
  review_status: 'pending' | 'confirmed' | 'overridden';
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  final_score?: number | string | null;
  review_note?: string | null;
  created_at: string;
}

export interface RecordDetail {
  id: number;
  patient_name: string;
  gender: string;
  mrn: string;
  age?: number;
  allergy?: string;
  dept_name?: string;
  doctor_name?: string;
  doctor_id?: number;
  visit_id?: number;
  visit_no: string;
  visit_type: string;
  visit_time: string;
  status: string;
  chief_complaint?: string;
  present_illness?: string;
  past_history?: string;
  physical_exam?: string;
  auxiliary_exam?: string;
  diagnosis?: string;
  treatment?: string;
  latestQC?: LatestQC | null;
  versionCount?: number;
  openTask?: {
    id: number;
    status: string;
    due_at: string;
    created_at: string;
  } | null;
}

export interface Department {
  id: number;
  name: string;
  category?: string;
}

export interface PatientRow {
  id: number;
  mrn: string;
  name: string;
  gender: string;
  birth_date?: string | null;
  age?: number | null;
  phone?: string | null;
  blood_type?: string | null;
  allergy?: string | null;
  visit_count?: number;
  last_visit_at?: string | null;
}

export interface VisitRow {
  id: number;
  visit_no: string;
  patient_id: number;
  dept_id: number;
  doctor_id: number;
  visit_type: string;
  chief_complaint?: string | null;
  diagnosis?: string | null;
  visit_time: string;
  dept_name?: string;
  doctor_name?: string;
  patient_name?: string;
  gender?: string;
  birth_date?: string | null;
  mrn?: string;
  allergy?: string | null;
  record_id?: number | null;
}

export interface PatientDetail extends PatientRow {
  id_card?: string | null;
  visits: VisitRow[];
}

export interface RecordVersion {
  id: number;
  record_id: number;
  version: number;
  score: number | null;
  level: string | null;
  report_id: number | null;
  source: string;
  created_at: string;
}

export interface VersionChange {
  field: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

export interface VersionCompare {
  from: { version: number; score: number | null; level: string | null; dimensions: any; created_at: string; report_id: number | null };
  to: { version: number; score: number | null; level: string | null; dimensions: any; created_at: string; report_id: number | null };
  changes: VersionChange[];
  changedFields: string[];
  scoreDelta: number | null;
}

export interface QCHistoryItem {
  id: number;
  score: number | string;
  level: string;
  risk: number;
  model: string;
  duration_ms?: number;
  prev_score?: number | string | null;
  score_delta?: number | string | null;
  record_version?: number | null;
  review_status: string;
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  final_score?: number | string | null;
  review_note?: string | null;
  created_at: string;
}

export interface BatchItem {
  id: number;
  record_id: number;
  status: 'pending' | 'running' | 'ok' | 'failed';
  score: number | string | null;
  level: string | null;
  report_id: number | null;
  error: string | null;
  ms: number | null;
  patient_name: string;
  mrn: string;
  dept_name?: string;
}

export interface BatchStatus {
  id: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  total: number;
  done: number;
  failed: number;
  improved: number;
  avg_delta: number | null;
  percent: number;
  running: boolean;
  created_at: string;
  finished_at: string | null;
  items: BatchItem[];
}

export interface RecordInput {
  visitId?: number;
  chief_complaint?: string;
  present_illness?: string;
  past_history?: string;
  physical_exam?: string;
  auxiliary_exam?: string;
  diagnosis?: string;
  treatment?: string;
  status?: string;
}

export const api = {
  mpStatus: () => request<{ configured: boolean }>({ url: '/api/mp/status' }),

  mpLogin: (data: {
    code?: string;
    bindToken?: string;
    username?: string;
    password?: string;
  }) => request<{
    token?: string;
    user?: MiniUser;
    needBind?: boolean;
    bindToken?: string;
  }>({ url: '/api/mp/login', method: 'POST', data }),

  login: (username: string, password: string) =>
    request<{ token: string; user: MiniUser }>({
      url: '/api/auth/login',
      method: 'POST',
      data: { username, password },
    }),

  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ token: string }>({
      url: '/api/auth/change-password',
      method: 'POST',
      data: { oldPassword, newPassword },
    }),

  overview: () => request<Record<string, number>>({ url: '/api/dashboard/overview' }),

  trends: (days = 7) => request<any[]>({ url: '/api/dashboard/trends', data: { days } }),

  deptDistribution: () => request<any[]>({ url: '/api/dashboard/dept-distribution' }),

  issueCategories: () => request<any[]>({ url: '/api/dashboard/issue-categories' }),

  recentQC: () => request<any[]>({ url: '/api/dashboard/recent-qc' }),

  rectification: () => request<any>({ url: '/api/dashboard/rectification' }),

  reviews: (params: { page?: number; size?: number } = {}) =>
    request<Paged<ReviewItem>>({
      url: '/api/reviews/pending',
      data: { page: params.page || 1, size: params.size || 20 },
    }),

  review: (reportId: number, data: { action: 'confirm' | 'override'; score?: number; note?: string }) =>
    request<any>({ url: `/api/reviews/${reportId}`, method: 'POST', data }),

  tasks: (params: { page?: number; size?: number; status?: string } = {}) =>
    request<TaskPaged>({
      url: '/api/rectify-tasks',
      data: { page: params.page || 1, size: params.size || 20, status: params.status || '' },
    }),

  closeTask: (id: number, note: string) =>
    request<any>({ url: `/api/rectify-tasks/${id}/close`, method: 'POST', data: { note } }),

  submitTask: (id: number, note: string) =>
    request<any>({ url: `/api/rectify-tasks/${id}/submit`, method: 'POST', data: { note } }),

  departments: () => request<Department[]>({ url: '/api/departments' }),

  patients: (params: { page?: number; size?: number; keyword?: string } = {}) =>
    request<Paged<PatientRow>>({
      url: '/api/patients',
      data: { page: params.page || 1, size: params.size || 20, keyword: params.keyword || '' },
    }),

  patient: (id: number) => request<PatientDetail>({ url: `/api/patients/${id}` }),

  createPatient: (data: any) =>
    request<{ id: number }>({ url: '/api/patients', method: 'POST', data }),

  updatePatient: (id: number, data: any) =>
    request<any>({ url: `/api/patients/${id}`, method: 'PUT', data }),

  visits: (params: { page?: number; size?: number; patientId?: number; keyword?: string } = {}) =>
    request<Paged<VisitRow>>({
      url: '/api/visits',
      data: {
        page: params.page || 1,
        size: params.size || 20,
        patientId: params.patientId || '',
        keyword: params.keyword || '',
      },
    }),

  visit: (id: number) => request<VisitRow>({ url: `/api/visits/${id}` }),

  createVisit: (data: { patientId: number; deptId: number; visitType?: string; chiefComplaint?: string; diagnosis?: string }) =>
    request<{ id: number; visitNo: string }>({ url: '/api/visits', method: 'POST', data }),

  records: (params: { page?: number; size?: number; keyword?: string; status?: string } = {}) =>
    request<Paged<RecordRow>>({
      url: '/api/records',
      data: {
        page: params.page || 1,
        size: params.size || 20,
        keyword: params.keyword || '',
        status: params.status || '',
      },
    }),

  record: (id: number) => request<RecordDetail>({ url: `/api/records/${id}` }),

  runQC: (id: number) => request<any>({ url: `/api/records/${id}/qc`, method: 'POST' }),

  createRecord: (data: RecordInput) =>
    request<{ id: number }>({ url: '/api/records', method: 'POST', data }),

  updateRecord: (id: number, data: RecordInput) =>
    request<any>({ url: `/api/records/${id}`, method: 'PUT', data }),

  qcHistory: (id: number) => request<QCHistoryItem[]>({ url: `/api/records/${id}/qc-history` }),

  versions: (id: number) => request<RecordVersion[]>({ url: `/api/records/${id}/versions` }),

  compareVersions: (id: number, from?: number, to?: number) =>
    request<VersionCompare | null>({
      url: `/api/records/${id}/versions/compare`,
      data: { from: from || '', to: to || '' },
    }),

  createBatch: (recordIds: number[]) =>
    request<{ batchId: number; total: number; skipped: number[] }>({
      url: '/api/records/batch-qc',
      method: 'POST',
      data: { recordIds },
    }),

  batchStatus: (id: number) => request<BatchStatus>({ url: `/api/records/batch-qc/${id}` }),

  rules: () => request<any[]>({ url: '/api/rules' }),

  ruleUsage: () => request<Record<string, number>>({ url: '/api/rules/usage' }),

  updateRule: (id: number, data: { enabled?: boolean; weight?: number; severity?: string }) =>
    request<any>({ url: `/api/rules/${id}`, method: 'PUT', data }),

  logs: (params: { page?: number; size?: number; action?: string; keyword?: string } = {}) =>
    request<Paged<any>>({
      url: '/api/logs',
      data: {
        page: params.page || 1,
        size: params.size || 20,
        action: params.action || '',
        keyword: params.keyword || '',
      },
    }),

  verifyLogs: () => request<any>({ url: '/api/logs/verify' }),

  users: () => request<any[]>({ url: '/api/users' }),

  createUser: (data: any) => request<any>({ url: '/api/users', method: 'POST', data }),

  updateUser: (id: number, data: any) => request<any>({ url: `/api/users/${id}`, method: 'PUT', data }),
};

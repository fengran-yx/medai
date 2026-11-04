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

  overview: () => request<Record<string, number>>({ url: '/api/dashboard/overview' }),

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
};

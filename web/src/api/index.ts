import { http } from './http';

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'quality' | 'clinician';
  title?: string;
  deptId?: number;
  deptName?: string;
}

export interface Paged<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
}

export interface QCIssue {
  ruleCode: string;
  rule: string;
  severity: 'critical' | 'major' | 'minor';
  field: string;
  message: string;
  suggestion: string;
}

export interface QCReport {
  reportId?: number;
  recordId?: number;
  score: number;
  level: string;
  dimensions: { completeness: number; accuracy: number; logic: number; terminology: number };
  risk: number;
  issues: QCIssue[];
  suggestions: string[];
  summary: string;
  model: string;
  durationMs?: number;
  source?: string;
  status?: string;
  prevScore?: number | null;
  scoreDelta?: number | null;
  version?: number | null;
  review_status?: 'pending' | 'confirmed' | 'overridden';
  final_score?: number | null;
  reviewer_name?: string | null;
  review_note?: string | null;
  reviewed_at?: string | null;
}

export interface ReviewItem {
  id: number;
  record_id: number;
  score: number | string;
  level: string;
  risk: number;
  issues: any[] | string;
  issueCount: number;
  model: string;
  created_at: string;
  review_status: string;
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
  note?: string | null;
  created_at: string;
  closed_at?: string | null;
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

export interface Rectification {
  pendingCount: number;
  reviewedCount: number;
  improvedCount: number;
  closedCount: number;
  closedRate: number;
  avgGain: number;
  items: any[];
}

export const api = {
  login: (username: string, password: string) =>
    http.post<never, { token: string; user: User }>('/auth/login', { username, password }),
  me: () => http.get<never, User>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    http.post<never, { token: string }>('/auth/change-password', { oldPassword, newPassword }),

  overview: () => http.get<never, Record<string, number>>('/dashboard/overview'),
  trends: (days = 7) => http.get<never, any[]>('/dashboard/trends', { params: { days } }),
  deptDistribution: () => http.get<never, any[]>('/dashboard/dept-distribution'),
  issueCategories: () => http.get<never, any[]>('/dashboard/issue-categories'),
  recentQC: () => http.get<never, any[]>('/dashboard/recent-qc'),
  rectification: () => http.get<never, Rectification>('/dashboard/rectification'),

  patients: (params: any) => http.get<never, Paged<any>>('/patients', { params }),
  patient: (id: number) => http.get<never, any>(`/patients/${id}`),
  createPatient: (data: any) => http.post('/patients', data),
  updatePatient: (id: number, data: any) => http.put(`/patients/${id}`, data),

  visits: (params: any) => http.get<never, Paged<any>>('/visits', { params }),
  createVisit: (data: any) => http.post('/visits', data),
  departments: () => http.get<never, any[]>('/departments'),

  records: (params: any) => http.get<never, Paged<any>>('/records', { params }),
  record: (id: number) => http.get<never, any>(`/records/${id}`),
  createRecord: (data: any) => http.post('/records', data),
  updateRecord: (id: number, data: any) => http.put(`/records/${id}`, data),
  runQC: (id: number) => http.post<never, QCReport>(`/records/${id}/qc`),
  qcHistory: (id: number) => http.get<never, any[]>(`/records/${id}/qc-history`),
  versions: (id: number) => http.get<never, RecordVersion[]>(`/records/${id}/versions`),
  compareVersions: (id: number, from?: number, to?: number) =>
    http.get<never, VersionCompare | null>(`/records/${id}/versions/compare`, { params: { from, to } }),
  createBatch: (recordIds: number[]) => http.post<never, { batchId: number; total: number; skipped: number[] }>('/records/batch-qc', { recordIds }),
  batchStatus: (id: number) => http.get<never, BatchStatus>(`/records/batch-qc/${id}`),

  reviewsPending: (params: any) => http.get<never, Paged<ReviewItem>>('/reviews/pending', { params }),
  reviewReport: (reportId: number, data: { action: 'confirm' | 'override'; score?: number; note?: string }) =>
    http.post<never, any>(`/reviews/${reportId}`, data),

  tasks: (params: any) => http.get<never, TaskPaged>('/rectify-tasks', { params }),
  closeTask: (id: number, note: string) => http.post(`/rectify-tasks/${id}/close`, { note }),

  aiStatus: () => http.get<never, { remote: boolean; provider: string }>('/ai/status'),
  diagnosis: (data: any) => http.post<never, any>('/ai/diagnosis', data),
  diagnosisHistory: () => http.get<never, any[]>('/ai/diagnosis-history'),
  chats: () => http.get<never, any[]>('/ai/chats'),
  chatMessages: (id: number) => http.get<never, any>(`/ai/chats/${id}/messages`),
  sendChat: (data: { chatId?: number; message: string }) => http.post<never, any>('/ai/chat', data),
  deleteChat: (id: number) => http.delete(`/ai/chats/${id}`),

  rules: () => http.get<never, any[]>('/rules'),
  ruleUsage: () => http.get<never, Record<string, number>>('/rules/usage'),
  updateRule: (id: number, data: any) => http.put(`/rules/${id}`, data),

  logs: (params: any) => http.get<never, Paged<any>>('/logs', { params }),
  verifyLogs: () => http.get<never, any>('/logs/verify'),

  users: () => http.get<never, any[]>('/users'),
  createUser: (data: any) => http.post('/users', data),
  updateUser: (id: number, data: any) => http.put(`/users/${id}`, data),
};

// ---------- 知识库（RAG） ----------
export const kbApi = {
  stats: () => http.get<never, { documents: number; chunks: number; questions: number }>('/kb/stats'),
  documents: () => http.get<never, any[]>('/kb/documents'),
  createDocument: (data: any) => http.post<never, any>('/kb/documents', data),
  deleteDocument: (id: number) => http.delete(`/kb/documents/${id}`),
  search: (q: string, topK = 5) => http.get<never, any[]>('/kb/search', { params: { q, topK } }),
  ask: (question: string, topK = 5) => http.post<never, any>('/kb/ask', { question, topK }),
};

// ---------- Agent（工具调用） ----------
export const agentApi = {
  tools: () => http.get<never, any[]>('/agent/tools'),
  run: (goal: string) => http.post<never, any>('/agent/run', { goal }),
  runs: (limit = 10) => http.get<never, any[]>('/agent/runs', { params: { limit } }),
  runDetail: (id: number) => http.get<never, any>(`/agent/runs/${id}`),
};

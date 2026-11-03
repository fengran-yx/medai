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
}

export const api = {
  login: (username: string, password: string) =>
    http.post<never, { token: string; user: User }>('/auth/login', { username, password }),
  me: () => http.get<never, User>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    http.post('/auth/change-password', { oldPassword, newPassword }),

  overview: () => http.get<never, Record<string, number>>('/dashboard/overview'),
  trends: (days = 7) => http.get<never, any[]>('/dashboard/trends', { params: { days } }),
  deptDistribution: () => http.get<never, any[]>('/dashboard/dept-distribution'),
  issueCategories: () => http.get<never, any[]>('/dashboard/issue-categories'),
  recentQC: () => http.get<never, any[]>('/dashboard/recent-qc'),

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

  aiStatus: () => http.get<never, { remote: boolean; provider: string }>('/ai/status'),
  diagnosis: (data: any) => http.post<never, any>('/ai/diagnosis', data),
  diagnosisHistory: () => http.get<never, any[]>('/ai/diagnosis-history'),
  chats: () => http.get<never, any[]>('/ai/chats'),
  chatMessages: (id: number) => http.get<never, any>(`/ai/chats/${id}/messages`),
  sendChat: (data: { chatId?: number; message: string }) => http.post<never, any>('/ai/chat', data),
  deleteChat: (id: number) => http.delete(`/ai/chats/${id}`),

  rules: () => http.get<never, any[]>('/rules'),
  updateRule: (id: number, data: any) => http.put(`/rules/${id}`, data),

  logs: (params: any) => http.get<never, Paged<any>>('/logs', { params }),

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

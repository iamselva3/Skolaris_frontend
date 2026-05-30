import { apiClient } from './client';
import type { ApiEnvelope, Difficulty, PaginatedResponse, QuestionType } from '../types';

/* ────────────────────────── Filters ────────────────────────── */

export interface ReportFilterParams {
  dateFrom?: string;
  dateTo?: string;
  programId?: string;
  subjectId?: string;
  topicId?: string;
  chapterId?: string;
  branchId?: string;
  classroomId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

/** Drops empty/null params so the query string stays clean. */
const clean = (p: ReportFilterParams): Record<string, string | number> => {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v as string | number;
  }
  return out;
};

export type QuestionFlag = 'too_easy' | 'too_hard' | 'ambiguous' | 'normal';

/* ────────────────────────── Row / detail shapes ────────────────────────── */

export interface ReportsOverview {
  totalExams: number;
  liveExams: number;
  totalAttempts: number;
  avgScorePercent: number;
  totalStudents: number;
  avgAccuracyPercent: number;
  weakTopicCount: number;
  questionsTracked: number;
  classCount: number;
}

export interface ExamReportRow {
  examId: string;
  title: string;
  program: string | null;
  subject: string | null;
  status: string;
  totalQuestions: number;
  totalMarks: number;
  assignedCount: number;
  attemptCount: number;
  submittedCount: number;
  gradedCount: number;
  completionPercent: number;
  avgScorePercent: number;
  avgTimeSeconds: number;
  opensAt: string | null;
  closesAt: string | null;
}

export interface ExamReportDetail {
  header: {
    examId: string;
    title: string;
    program: string | null;
    subject: string | null;
    status: string;
    totalMarks: number;
    totalQuestions: number;
  };
  summary: {
    totalAttempts: number;
    submittedCount: number;
    gradedCount: number;
    avgScore: number;
    distribution: Array<{ bucket: string; count: number }>;
  };
  questions: Array<{
    examQuestionId: string;
    questionId: string;
    stem: string;
    type: QuestionType | null;
    difficulty: Difficulty | null;
    subject: string | null;
    topic: string | null;
    totalAnswered: number;
    correctCount: number;
    correctPercent: number;
    avgTimeSeconds: number;
    flag: QuestionFlag;
  }>;
}

export interface StudentReportRow {
  studentId: string;
  name: string;
  classLabel: string | null;
  rollNo: string | null;
  attemptsTotal: number;
  gradedCount: number;
  avgScorePercent: number;
  accuracyPercent: number;
  weakTopicCount: number;
}

export interface StudentReportDetail {
  student: { id: string; name: string; classLabel: string | null; rollNo: string | null };
  trend: Array<{ examId: string; examTitle: string; dateIso: string | null; scorePercent: number }>;
  totalTimeSeconds: number;
  avgTimePerQuestionSeconds: number;
  accuracyPercent: number;
  summary: { attemptsTotal: number; avgScore: number; weakTopicsCount: number };
  weakTopics: Array<{
    subject: string;
    topic: string;
    scorePercent: number;
    attemptsCount: number;
    correctCount: number;
  }>;
}

export interface TopicRollupRow {
  subject: string;
  topic: string;
  studentsAssessed: number;
  avgScorePercent: number;
  accuracyPercent: number;
  weakStudents: number;
  weakSharePercent: number;
}

export interface QuestionReportRow {
  questionId: string;
  stem: string;
  type: QuestionType | string;
  difficulty: Difficulty | string;
  subject: string | null;
  topic: string | null;
  totalAttempts: number;
  correctAttempts: number;
  correctPercent: number;
  avgTimeSeconds: number;
  flag: QuestionFlag;
}

export interface ClassReportRow {
  classroomId: string;
  name: string;
  year: string | null;
  section: string | null;
  studentCount: number;
  examsAssigned: number;
  attemptsTotal: number;
  submittedCount: number;
  completionPercent: number;
  avgScorePercent: number;
}

/* ────────────────────────── Client ────────────────────────── */

export const reportsApi = {
  overview: async (): Promise<ReportsOverview> => {
    const r = await apiClient.get<ApiEnvelope<ReportsOverview>>('/reports/overview');
    return r.data.data;
  },

  exams: async (params: ReportFilterParams = {}): Promise<PaginatedResponse<ExamReportRow>> => {
    const r = await apiClient.get<PaginatedResponse<ExamReportRow>>('/reports/exams', {
      params: clean(params),
    });
    return r.data;
  },
  examDetail: async (examId: string): Promise<ExamReportDetail> => {
    const r = await apiClient.get<ApiEnvelope<ExamReportDetail>>(`/reports/exams/${examId}`);
    return r.data.data;
  },

  students: async (params: ReportFilterParams = {}): Promise<PaginatedResponse<StudentReportRow>> => {
    const r = await apiClient.get<PaginatedResponse<StudentReportRow>>('/reports/students', {
      params: clean(params),
    });
    return r.data;
  },
  studentDetail: async (studentId: string): Promise<StudentReportDetail> => {
    const r = await apiClient.get<ApiEnvelope<StudentReportDetail>>(`/reports/students/${studentId}`);
    return r.data.data;
  },

  topics: async (params: ReportFilterParams = {}): Promise<PaginatedResponse<TopicRollupRow>> => {
    const r = await apiClient.get<PaginatedResponse<TopicRollupRow>>('/reports/topics', {
      params: clean(params),
    });
    return r.data;
  },

  weakTopics: async (params: ReportFilterParams = {}): Promise<PaginatedResponse<TopicRollupRow>> => {
    const r = await apiClient.get<PaginatedResponse<TopicRollupRow>>('/reports/weak-topics', {
      params: clean(params),
    });
    return r.data;
  },

  questions: async (
    params: ReportFilterParams = {},
  ): Promise<PaginatedResponse<QuestionReportRow>> => {
    const r = await apiClient.get<PaginatedResponse<QuestionReportRow>>('/reports/questions', {
      params: clean(params),
    });
    return r.data;
  },

  classes: async (params: ReportFilterParams = {}): Promise<PaginatedResponse<ClassReportRow>> => {
    const r = await apiClient.get<PaginatedResponse<ClassReportRow>>('/reports/classes', {
      params: clean(params),
    });
    return r.data;
  },
};

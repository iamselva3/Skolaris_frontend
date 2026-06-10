import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from '@/lib/auth/RequireAuth';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { homePathFor } from '@/lib/utils/role';
import { AppShell } from '@/components/layout/AppShell';
import { Loader } from '@/components/ui/Loader';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { StudentsListPage } from '@/pages/students/StudentsListPage';
import { TeachersListPage } from '@/pages/teachers/TeachersListPage';
import { ClassroomsListPage } from '@/pages/classrooms/ClassroomsListPage';
import { ClassroomDetailPage } from '@/pages/classrooms/ClassroomDetailPage';
import { AddStudentsPage } from '@/pages/classrooms/AddStudentsPage';
import { ExamsListPage } from '@/pages/exams/ExamsListPage';
import { ExamComposePage } from '@/pages/exams/ExamComposePage';
import { ExamDetailPage } from '@/pages/exams/ExamDetailPage';
import { ExamAttemptDetailPage } from '@/pages/exams/ExamAttemptDetailPage';
import { ManageQuestionPapersPage } from '@/pages/question-papers/ManageQuestionPapersPage';
import { ComposeQuestionPaperPage } from '@/pages/question-papers/ComposeQuestionPaperPage';
import { ManageTestsPage } from '@/pages/tests/ManageTestsPage';
import { QuestionsListPage } from '@/pages/questions/QuestionsListPage';
import { TaxonomyAdminPage } from '@/pages/taxonomy/TaxonomyAdminPage';
import { BranchesListPage } from '@/pages/branches/BranchesListPage';

// Code-split the rich editor route — TipTap + KaTeX add ~600 KB to the main
// bundle and only teachers who actually open Add/Edit Question need them.
const QuestionFormPage = lazy(() =>
  import('@/pages/questions/QuestionFormPage').then((m) => ({ default: m.QuestionFormPage })),
);

const EditorFallback = (): JSX.Element => (
  <div className="flex h-[60vh] items-center justify-center text-sm text-text-muted">
    <Loader /> <span className="ml-2">Loading editor…</span>
  </div>
);

const Editor = (el: JSX.Element): JSX.Element => (
  <Suspense fallback={<EditorFallback />}>{el}</Suspense>
);
import { AttemptsListPage } from '@/pages/attempts/AttemptsListPage';
import { UploadsListPage } from '@/pages/uploads/UploadsListPage';
import { UploadNewPage } from '@/pages/uploads/UploadNewPage';
import { UploadReviewPage } from '@/pages/uploads/UploadReviewPage';
import { LiveExamsPage } from '@/pages/student/LiveExamsPage';
import { UpcomingExamsPage } from '@/pages/student/UpcomingExamsPage';
import { QuickActionsPage } from '@/pages/student/QuickActionsPage';
import { MyResultsPage } from '@/pages/student/MyResultsPage';
import { AttemptPage } from '@/pages/student/AttemptPage';
import { AttemptResultPage } from '@/pages/student/AttemptResultPage';
import { NotificationsPage } from '@/pages/notifications/NotificationsPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { ReportsLauncherPage } from '@/pages/reports/ReportsLauncherPage';
import { ExamReportsPage } from '@/pages/reports/ExamReportsPage';
import { ExamReportDetailPage } from '@/pages/reports/ExamReportDetailPage';
import { StudentReportsPage } from '@/pages/reports/StudentReportsPage';
import { StudentReportDetailPage } from '@/pages/reports/StudentReportDetailPage';
import { TopicReportsPage } from '@/pages/reports/TopicReportsPage';
import { QuestionReportsPage } from '@/pages/reports/QuestionReportsPage';
import { ClassPerformancePage } from '@/pages/reports/ClassPerformancePage';
import { WeakTopicAnalysisPage } from '@/pages/reports/WeakTopicAnalysisPage';
import { ExportCenterPage } from '@/pages/reports/ExportCenterPage';

const Admin = (el: JSX.Element) => (
  <RequireAuth allowedRoles={['SUPER_ADMIN', 'TEACHER']}>{el}</RequireAuth>
);
const Student = (el: JSX.Element) => <RequireAuth allowedRoles={['STUDENT']}>{el}</RequireAuth>;
const Any = (el: JSX.Element) => <RequireAuth>{el}</RequireAuth>;

/**
 * Role-aware index redirect. Students go to /me/exams, staff to /dashboard.
 * Rendered inside the authenticated shell, so `user` is resolved. Avoids the
 * old "/ → /dashboard → (student forbidden) → /me/exams" double-bounce.
 */
const RoleHomeRedirect = (): JSX.Element => {
  const { user } = useCurrentUser();
  return <Navigate to={user ? homePathFor(user.role) : '/dashboard'} replace />;
};

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forbidden', element: <ForbiddenPage /> },

  // Full-bleed student attempt pages — NO AppShell.
  { path: '/me/exams/:examId/attempt', element: Student(<AttemptPage />) },
  { path: '/me/attempts/:attemptId/result', element: Student(<AttemptResultPage />) },

  {
    element: Any(<AppShell />),
    children: [
      { index: true, element: <RoleHomeRedirect /> },

      // Admin / teacher
      { path: 'dashboard',                element: Any(<DashboardPage />) },
      { path: 'branches',                 element: <RequireAuth allowedRoles={['SUPER_ADMIN']}><BranchesListPage /></RequireAuth> },
      { path: 'students',                 element: Admin(<StudentsListPage />) },
      { path: 'teachers',                 element: <RequireAuth allowedRoles={['SUPER_ADMIN']}><TeachersListPage /></RequireAuth> },
      { path: 'classrooms',               element: Admin(<ClassroomsListPage />) },
      { path: 'classrooms/:id',           element: Admin(<ClassroomDetailPage />) },
      { path: 'classrooms/:id/add-students', element: Admin(<AddStudentsPage />) },
      { path: 'taxonomy',                 element: <RequireAuth allowedRoles={['SUPER_ADMIN']}><TaxonomyAdminPage /></RequireAuth> },
      { path: 'questions',                element: Admin(<QuestionsListPage />) },
      { path: 'questions/new',            element: Admin(Editor(<QuestionFormPage />)) },
      { path: 'questions/:id/edit',       element: Admin(Editor(<QuestionFormPage />)) },
      { path: 'uploads',                  element: Admin(<UploadsListPage />) },
      { path: 'uploads/new',              element: Admin(<UploadNewPage />) },
      { path: 'uploads/:uploadId/review', element: Admin(<UploadReviewPage />) },
      { path: 'exams',                    element: Admin(<ExamsListPage />) },
      { path: 'question-papers',          element: Admin(<ManageQuestionPapersPage />) },
      { path: 'question-papers/:id/compose', element: Admin(<ComposeQuestionPaperPage />) },
      { path: 'tests',                    element: Admin(<ManageTestsPage />) },
      { path: 'exams/new',                element: Admin(<ExamsListPage />) /* TODO Phase D: dedicated compose entry */ },
      { path: 'exams/:id',                element: Admin(<ExamDetailPage />) },
      { path: 'exams/:id/compose',        element: Admin(<ExamComposePage />) },
      { path: 'exams/:id/attempts/:attemptId', element: Admin(<ExamAttemptDetailPage />) },
      { path: 'attempts',                 element: Admin(<AttemptsListPage />) },
      { path: 'analytics',                element: Admin(<DashboardPage />) /* placeholder until Phase 4 */ },

      // Reports (DIGITAL → Reports operational analytics workspace)
      { path: 'reports',                       element: Admin(<ReportsLauncherPage />) },
      { path: 'reports/exams',                 element: Admin(<ExamReportsPage />) },
      { path: 'reports/exams/:examId',         element: Admin(<ExamReportDetailPage />) },
      { path: 'reports/students',              element: Admin(<StudentReportsPage />) },
      { path: 'reports/students/:studentId',   element: Admin(<StudentReportDetailPage />) },
      { path: 'reports/topics',                element: Admin(<TopicReportsPage />) },
      { path: 'reports/questions',             element: Admin(<QuestionReportsPage />) },
      { path: 'reports/classes',               element: Admin(<ClassPerformancePage />) },
      { path: 'reports/weak-topics',           element: Admin(<WeakTopicAnalysisPage />) },
      { path: 'reports/export',                element: Admin(<ExportCenterPage />) },

      // Student
      { path: 'me/live',                  element: Student(<LiveExamsPage />) },
      { path: 'me/upcoming',              element: Student(<UpcomingExamsPage />) },
      { path: 'me/actions',               element: Student(<QuickActionsPage />) },
      { path: 'me/results',               element: Student(<MyResultsPage />) },

      // Shared
      { path: 'notifications',            element: Any(<NotificationsPage />) },
      { path: 'settings',                 element: Any(<SettingsPage />) },
    ],
  },

  // Catch-all MUST be last.
  { path: '*', element: <NotFoundPage /> },
]);

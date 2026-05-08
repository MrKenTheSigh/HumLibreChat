import { Navigate } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import {
  PromptsView,
  PromptForm,
  CreatePromptForm,
  EmptyPromptPreview,
} from '~/components/Prompts';
import {
  AdminActivityLogsPage,
  AdminManagerReviewsPage,
  AdminOrganizationGraphPage,
  AdminChannelForm,
  AdminChannelsPage,
  AdminConversationDetail,
  AdminConversationsPage,
  AdminDepartmentForm,
  AdminDepartmentsPage,
  AdminPlanForm,
  AdminPlansPage,
  AdminQuotasPage,
  AdminRolesPage,
  AdminUsagePage,
  AdminUserDetail,
  AdminUsersPage,
  AdminView,
} from '~/components/Admin';
import { useAuthContext } from '~/hooks';
import DashboardRoute from './Layouts/Dashboard';

function AdminIndexRedirect() {
  const { user } = useAuthContext();
  const target = user?.role === SystemRoles.ADMIN ? '/d/admin/users' : '/d/admin/conversations';

  return <Navigate to={target} replace={true} />;
}

const dashboardRoutes = {
  path: 'd/*',
  element: <DashboardRoute />,
  children: [
    /*
    {
      element: <FileDashboardView />,
      children: [
        {
          index: true,
          element: <EmptyVectorStorePreview />,
        },
        {
          path: ':vectorStoreId',
          element: <DataTableFilePreview />,
        },
      ],
    },
    {
      path: 'files/*',
      element: <FilesListView />,
      children: [
        {
          index: true,
          element: <EmptyFilePreview />,
        },
        {
          path: ':fileId',
          element: <FilePreview />,
        },
      ],
    },
    {
      path: 'vector-stores/*',
      element: <VectorStoreView />,
      children: [
        {
          index: true,
          element: <EmptyVectorStorePreview />,
        },
        {
          path: ':vectorStoreId',
          element: <VectorStorePreview />,
        },
      ],
    },
    */
    {
      path: 'admin',
      element: <AdminView />,
      children: [
        {
          index: true,
          element: <AdminIndexRedirect />,
        },
        {
          path: 'users',
          element: <AdminUsersPage />,
          children: [
            {
              path: ':userId',
              element: <AdminUserDetail />,
            },
          ],
        },
        {
          path: 'departments',
          element: <AdminDepartmentsPage />,
          children: [
            {
              path: 'new',
              element: <AdminDepartmentForm />,
            },
            {
              path: ':departmentId',
              element: <AdminDepartmentForm />,
            },
          ],
        },
        {
          path: 'roles',
          element: <AdminRolesPage />,
        },
        {
          path: 'channels',
          element: <AdminChannelsPage />,
          children: [
            {
              path: 'new',
              element: <AdminChannelForm />,
            },
            {
              path: ':channelId',
              element: <AdminChannelForm />,
            },
          ],
        },
        {
          path: 'plans',
          element: <AdminPlansPage />,
          children: [
            {
              path: 'new',
              element: <AdminPlanForm />,
            },
            {
              path: ':planId',
              element: <AdminPlanForm />,
            },
          ],
        },
        {
          path: 'quotas',
          element: <AdminQuotasPage />,
        },
        {
          path: 'conversations',
          element: <AdminConversationsPage />,
          children: [
            {
              path: ':conversationId',
              element: <AdminConversationDetail />,
            },
          ],
        },
        {
          path: 'usage',
          element: <AdminUsagePage />,
        },
        {
          path: 'manager-reviews',
          element: <AdminManagerReviewsPage />,
        },
        {
          path: 'activity-logs',
          element: <AdminActivityLogsPage />,
        },
        {
          path: 'org-graph',
          element: <AdminOrganizationGraphPage />,
        },
      ],
    },
    {
      path: 'prompts/*',
      element: <PromptsView />,
      children: [
        {
          index: true,
          element: <EmptyPromptPreview />,
        },
        {
          path: 'new',
          element: <CreatePromptForm />,
        },
        {
          path: ':promptId',
          element: <PromptForm />,
        },
      ],
    },
    {
      path: '*',
      element: <Navigate to="/d/files" replace={true} />,
    },
  ],
};

export default dashboardRoutes;

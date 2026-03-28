import { Navigate } from 'react-router-dom';
import {
  PromptsView,
  PromptForm,
  CreatePromptForm,
  EmptyPromptPreview,
} from '~/components/Prompts';
import {
  AdminChannelForm,
  AdminChannelsPage,
  AdminConversationDetail,
  AdminConversationsPage,
  AdminPlanForm,
  AdminPlansPage,
  AdminUsagePage,
  AdminUserDetail,
  AdminUsersPage,
  AdminView,
} from '~/components/Admin';
import DashboardRoute from './Layouts/Dashboard';

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
          element: <Navigate to="/d/admin/users" replace={true} />,
        },
        {
          path: 'users',
          element: <AdminUsersPage />,
        },
        {
          path: 'users/:userId',
          element: <AdminUserDetail />,
        },
        {
          path: 'channels',
          element: <AdminChannelsPage />,
        },
        {
          path: 'channels/new',
          element: <AdminChannelForm />,
        },
        {
          path: 'channels/:channelId',
          element: <AdminChannelForm />,
        },
        {
          path: 'plans',
          element: <AdminPlansPage />,
        },
        {
          path: 'plans/new',
          element: <AdminPlanForm />,
        },
        {
          path: 'plans/:planId',
          element: <AdminPlanForm />,
        },
        {
          path: 'conversations',
          element: <AdminConversationsPage />,
        },
        {
          path: 'conversations/:conversationId',
          element: <AdminConversationDetail />,
        },
        {
          path: 'usage',
          element: <AdminUsagePage />,
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

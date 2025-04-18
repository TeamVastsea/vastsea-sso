import type { RouteRecordRaw } from 'vue-router';
import Home from '@/pages/index.vue';
import { createRouter, createWebHistory } from 'vue-router';
import { setupGuard } from './guards';

export const dashboardHomeChildren: RouteRecordRaw[] = [
  {
    name: 'AccountManage',
    path: 'account',
    component: () => import('@/pages/dashboard/account/index.vue'),
    meta: {
      auth: true,
      title: '账号管理',
    },
  },
];

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: Home,
    children: [
      {
        path: 'dashboard',
        children: [
          {
            name: 'dashboard-login',
            path: 'login',
            component: () => import('@/pages/dashboard/login.vue'),
          },
          {
            name: 'DashBoardHome',
            path: 'home',
            component: () => import('@/pages/dashboard/home.vue'),
            meta: {
              auth: true,
            },
            children: dashboardHomeChildren,
          },
        ],
      },
    ],
  },
];
const router = createRouter({
  history: createWebHistory(),
  routes,
});

setupGuard(router);

export default router;

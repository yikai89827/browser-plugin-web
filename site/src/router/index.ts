import { createRouter, createWebHistory } from 'vue-router';
import Dashboard from '../pages/Dashboard.vue';
import AccountsPage from '../pages/AccountsPage.vue';
import PixelSharing from '../pages/PixelSharing.vue';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Dashboard,
      meta: { navId: 'dashboard', title: '仪表盘' },
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: AccountsPage,
      meta: { navId: 'accounts', title: '账户管理' },
    },
    {
      path: '/pixels',
      name: 'pixels',
      component: PixelSharing,
      meta: { navId: 'pixels', title: '像素分享' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

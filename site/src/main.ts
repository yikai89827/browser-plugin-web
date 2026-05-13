import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './style.css';

const t = localStorage.getItem('fb_admin_theme');
document.documentElement.dataset.adminTheme = t === 'light' ? 'light' : 'dark';

/** 本地管理站点（Vite）根组件挂载 */
const app = createApp(App);
app.use(router);
app.mount('#app');

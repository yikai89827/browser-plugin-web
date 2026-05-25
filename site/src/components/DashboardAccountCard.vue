<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import {
  loadDashboardAccountView,
  loadLocalUsername,
  saveLocalUsername,
  type DashboardAccountView,
} from '../lib/dashboardAccountProfile';
import { formatExtensionUserError } from '../lib/extensionUserMessages';

const initialLoading = ref(true);
const refreshing = ref(false);
const errorMsg = ref('');
const profile = ref<DashboardAccountView | null>(null);

const editOpen = ref(false);
const usernameDraft = ref('');
const copyTip = ref('');

async function refresh() {
  const isRefresh = profile.value != null;
  if (isRefresh) {
    refreshing.value = true;
  } else {
    initialLoading.value = true;
  }
  errorMsg.value = '';
  try {
    profile.value = await loadDashboardAccountView();
  } catch (e: unknown) {
    errorMsg.value = formatExtensionUserError(e);
    if (!isRefresh) profile.value = null;
  } finally {
    initialLoading.value = false;
    refreshing.value = false;
  }
}

function openUsernameEdit() {
  usernameDraft.value =
    loadLocalUsername() || (profile.value?.username !== '—' ? profile.value?.username || '' : '');
  editOpen.value = true;
}

function closeUsernameEdit() {
  editOpen.value = false;
}

function saveUsername() {
  saveLocalUsername(usernameDraft.value);
  editOpen.value = false;
  if (profile.value) {
    profile.value = {
      ...profile.value,
      username: usernameDraft.value.trim() || profile.value.facebookName || '—',
    };
  }
}

async function copyToken() {
  copyTip.value = '';
  const token = profile.value?.token;
  if (!token) {
    copyTip.value = '未保存 Token';
    return;
  }
  try {
    await navigator.clipboard.writeText(token);
    copyTip.value = '已复制';
  } catch {
    copyTip.value = '复制失败';
  }
  window.setTimeout(() => {
    copyTip.value = '';
  }, 2000);
}

function openFacebookLink() {
  const url = profile.value?.facebookLink;
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <section
    class="account-panel"
    :class="{ 'account-panel--has-content': profile }"
    aria-label="账户信息"
    :aria-busy="initialLoading || refreshing"
  >
    <p v-if="initialLoading && !profile" class="account-panel-hint muted">正在加载账户信息…</p>
    <p v-else-if="errorMsg && !profile" class="account-panel-hint account-panel-hint--err">{{ errorMsg }}</p>

    <div v-else-if="profile" class="account-panel-content">
      <div
        v-if="refreshing"
        class="account-panel-mask"
        aria-live="polite"
        aria-label="正在刷新账户信息"
      >
        <span class="account-panel-mask-spin" aria-hidden="true"></span>
        <span class="account-panel-mask-text">正在刷新…</span>
      </div>

      <div class="account-panel-toolbar">
        <button
          type="button"
          class="btn-account-refresh"
          :disabled="refreshing"
          title="重新加载账户信息"
          @click="refresh"
        >
          <span
            class="btn-account-refresh-icon"
            :class="{ 'btn-account-refresh-icon--spin': refreshing }"
            aria-hidden="true"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"></path>
              <path d="M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path>
            </svg>
          </span>
          {{ refreshing ? '加载中…' : '刷新' }}
        </button>
      </div>

      <p v-if="errorMsg && !refreshing" class="account-panel-inline-err">{{ errorMsg }}</p>

      <div class="account-panel-body">
        <div class="account-avatar" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" opacity="0.35">
            <path
              d="M12 12c2.8 0 5-2.2 5-5s-2.2-5-5-5-5 2.2-5 5 2.2 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"
            />
          </svg>
        </div>

        <div class="account-cols">
          <div class="account-col">
            <div class="account-row">
              <span class="account-label">用户名</span>
              <span class="account-value account-value--with-action">
                <span class="account-value-text">{{ profile.username }}</span>
                <button type="button" class="btn-icon-edit" title="编辑用户名" @click="openUsernameEdit">
                  ✎
                </button>
              </span>
            </div>
            <div class="account-row">
              <span class="account-label">账号ID</span>
              <span class="account-value mono">{{ profile.siteAccountId }}</span>
            </div>
            <div class="account-row">
              <span class="account-label">邮箱</span>
              <span class="account-value">{{ profile.email }}</span>
            </div>
            <div class="account-row">
              <span class="account-label">脸书账号ID</span>
              <span class="account-value mono">{{ profile.facebookUserId }}</span>
            </div>
          </div>

          <div class="account-col">
            <div class="account-row">
              <span class="account-label">脸书账号</span>
              <span class="account-value">{{ profile.facebookName }}</span>
            </div>
            <div class="account-row">
              <span class="account-label">Facebook Token</span>
              <span class="account-value account-value--actions">
                <button
                  type="button"
                  class="btn-icon-action"
                  :disabled="!profile.hasToken || refreshing"
                  :title="copyTip || (profile.hasToken ? '复制 Token' : '未保存 Token')"
                  @click="copyToken"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                  </svg>
                </button>
                <span v-if="copyTip" class="account-inline-tip">{{ copyTip }}</span>
              </span>
            </div>
            <div class="account-row">
              <span class="account-label">Facebook账号链接</span>
              <span class="account-value account-value--actions">
                <button
                  type="button"
                  class="btn-icon-action"
                  :disabled="!profile.facebookLink || refreshing"
                  title="打开 Facebook 主页"
                  @click="openFacebookLink"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="editOpen" class="modal-overlay" role="dialog" aria-modal="true" @click.self="closeUsernameEdit">
      <div class="modal-box">
        <h3>编辑用户名</h3>
        <p class="muted small">仅保存在本浏览器，用于仪表盘展示。</p>
        <input v-model="usernameDraft" type="text" class="modal-input" placeholder="输入用户名" />
        <div class="modal-actions">
          <button type="button" class="btn ghost" @click="closeUsernameEdit">取消</button>
          <button type="button" class="btn primary" @click="saveUsername">保存</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.account-panel {
  position: relative;
  margin-bottom: 24px;
  padding: 20px 24px;
  border-radius: 12px;
  background: var(--fb-dash-card-bg, #fff);
  box-shadow: var(--fb-dash-card-shadow, 0 2px 8px rgba(0, 0, 0, 0.05));
  border: 1px solid var(--fb-dash-card-header-border, #f3f4f6);
}
.account-panel--has-content {
  padding-top: 48px;
  min-height: 200px;
}
.account-panel-hint {
  margin: 0;
  font-size: 13px;
  min-height: 160px;
  display: flex;
  align-items: center;
}
.account-panel-hint--err {
  color: #f87171;
}
.account-panel-content {
  position: relative;
  min-height: 152px;
}
.account-panel-mask {
  position: absolute;
  inset: -48px -24px -20px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 12px;
  background: var(--fb-account-mask-bg, rgba(15, 23, 42, 0.55));
  backdrop-filter: blur(1px);
  pointer-events: all;
}
.account-panel-mask-spin {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--fb-btn-pay-spin-dim, rgba(147, 197, 253, 0.35));
  border-top-color: var(--fb-dash-view-all, #1877f2);
  animation: account-mask-spin 0.65s linear infinite;
}
.account-panel-mask-text {
  font-size: 13px;
  color: var(--fb-content-header-text, #e5e7eb);
}
@keyframes account-mask-spin {
  to {
    transform: rotate(360deg);
  }
}
.account-panel-toolbar {
  position: absolute;
  top: -34px;
  right: 0;
  z-index: 4;
}
.account-panel-inline-err {
  margin: 0 0 8px;
  font-size: 12px;
  color: #f87171;
}
.btn-account-refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  border-radius: 6px;
  border: 1px solid var(--fb-content-header-border, #d1d5db);
  background: var(--fb-user-pill-bg, #f3f4f6);
  color: var(--fb-content-header-text, #374151);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}
.btn-account-refresh:hover:not(:disabled) {
  border-color: var(--fb-dash-view-all, #1877f2);
  color: var(--fb-dash-view-all, #1877f2);
  background: rgba(24, 119, 242, 0.1);
}
.btn-account-refresh:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-account-refresh-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn-account-refresh-icon--spin svg {
  animation: account-refresh-spin 0.8s linear infinite;
}
@keyframes account-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}
.account-panel-body {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  flex-wrap: wrap;
}
.account-avatar {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--fb-surface-b, #e5e7eb);
  color: var(--fb-muted, #9ca3af);
  display: flex;
  align-items: center;
  justify-content: center;
}
.account-cols {
  flex: 1;
  min-width: 300px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px 48px;
}
.account-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.account-row {
  display: grid;
  grid-template-columns: minmax(148px, max-content) 1fr;
  gap: 12px 16px;
  align-items: center;
  font-size: 14px;
  line-height: 1.45;
}
.account-label {
  color: var(--fb-dash-table-th, #6b7280);
  text-align: right;
  white-space: nowrap;
  flex-shrink: 0;
}
.account-value {
  color: var(--fb-dash-table-td, #374151);
  min-width: 0;
  word-break: break-word;
}
.account-value--with-action,
.account-value--actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.account-value-text {
  min-width: 0;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 13px;
}
.muted {
  color: var(--fb-muted, #9ca3af);
}
.small {
  font-size: 12px;
}
.btn-icon-edit {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--fb-dash-view-all, #1877f2);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  transform: scaleX(-1);
}
.btn-icon-edit:hover {
  background: rgba(24, 119, 242, 0.1);
}
.btn-icon-action {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: rgba(24, 119, 242, 0.12);
  color: var(--fb-dash-view-all, #1877f2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}
.btn-icon-action:hover:not(:disabled) {
  background: rgba(24, 119, 242, 0.22);
}
.btn-icon-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.account-inline-tip {
  font-size: 12px;
  color: #22c55e;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal-box {
  width: min(400px, 96vw);
  padding: 20px;
  border-radius: 10px;
  background: var(--fb-modal-bg, #fff);
  color: var(--fb-modal-text, #111);
  border: 1px solid var(--fb-modal-border, #e5e7eb);
}
.modal-box h3 {
  margin: 0 0 8px;
  font-size: 16px;
}
.modal-input {
  width: 100%;
  box-sizing: border-box;
  margin: 12px 0 16px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--fb-input-border, #d1d5db);
  background: var(--fb-modal-input-bg, #fff);
  color: var(--fb-input-text, #111);
  font-size: 14px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.btn {
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}
.btn.primary {
  background: #1877f2;
  color: #fff;
}
.btn.ghost {
  background: var(--fb-ghost-bg, #f3f4f6);
  color: var(--fb-ghost-text, #374151);
}
</style>

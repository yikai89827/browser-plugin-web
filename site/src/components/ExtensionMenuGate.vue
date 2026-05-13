<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';
import { pingExtension, usesExtensionIdFromEnv } from '../lib/extensionBridge';

type GateState = 'checking' | 'no_config' | 'disconnected' | 'ready';

const emit = defineEmits<{
  /** 扩展是否已连通（用于壳层顶栏等） */
  connected: [ok: boolean];
  /** 首次或重连成功后，可在此拉取页面数据 */
  ready: [];
}>();

const gate = ref<GateState>('checking');

const overlayAriaLabel = computed(() => {
  switch (gate.value) {
    case 'checking':
      return '正在连接扩展';
    case 'no_config':
      return '未配置扩展 ID';
    default:
      return '请先安装并启用插件';
  }
});

async function runExtensionGate() {
  gate.value = 'checking';
  emit('connected', false);

  if (!usesExtensionIdFromEnv()) {
    gate.value = 'no_config';
    emit('connected', false);
    return;
  }

  const chromeApi = typeof chrome !== 'undefined' ? chrome : undefined;
  if (!chromeApi?.runtime?.sendMessage) {
    gate.value = 'disconnected';
    emit('connected', false);
    return;
  }

  try {
    const res = await pingExtension();
    if (res.success && res.payload?.ok) {
      gate.value = 'ready';
      emit('connected', true);
      emit('ready');
    } else {
      gate.value = 'disconnected';
      emit('connected', false);
    }
  } catch {
    gate.value = 'disconnected';
    emit('connected', false);
  }
}

function openChromeExtensionsPage() {
  try {
    window.open('chrome://extensions/', '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  void runExtensionGate();
});
</script>

<template>
  <div class="emg-host">
    <div
      v-if="gate !== 'ready'"
      class="emg-overlay"
      role="alertdialog"
      aria-modal="true"
      :aria-label="overlayAriaLabel"
    >
      <div class="emg-card">
        <template v-if="gate === 'checking'">
          <div class="emg-spinner" aria-hidden="true"></div>
          <p class="emg-title">正在连接扩展…</p>
          <p class="emg-sub muted">请稍候，正在检测本站点与插件的通信是否正常。</p>
        </template>

        <template v-else-if="gate === 'no_config'">
          <p class="emg-title">未配置扩展 ID</p>
          <p class="emg-desc">
            请在 <code>site/.env.development</code>（或 <code>site/.env</code>）中设置
            <code>VITE_EXTENSION_ID</code> 后重新运行站点构建。
          </p>
          <p class="emg-desc muted">配置完成前，本页将保持在此提示，不会加载业务内容。</p>
        </template>

        <template v-else>
          <p class="emg-title">请先安装并启用插件</p>
          <p class="emg-desc">
            未能连接到 FB 控制扩展：请使用 <strong>Chrome</strong> 打开本站，在
            <strong>扩展程序</strong> 中安装并<strong>启用</strong>本项目扩展；确认扩展 ID 与配置一致，且站点来源已写入扩展
            <code>externally_connectable</code>。
          </p>
          <p class="emg-desc muted">在扩展可用之前，本页将保持此遮盖层，不会进入功能界面。</p>
          <div class="emg-actions">
            <button type="button" class="emg-btn-primary" @click="openChromeExtensionsPage">打开扩展程序页</button>
            <button type="button" class="emg-btn-secondary" @click="runExtensionGate">重新检测</button>
          </div>
        </template>
      </div>
    </div>
    <div v-else class="emg-slot">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.emg-host {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: min(calc(100vh - 140px), 720px);
}
.emg-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(2px);
}
:global(.site-container.theme-light) .emg-overlay {
  background: rgba(245, 247, 250, 0.96);
}
.emg-card {
  max-width: 440px;
  padding: 24px 26px;
  border-radius: 10px;
  border: 1px solid var(--fb-border, #374151);
  background: var(--fb-surface-b, #1f2937);
  color: var(--fb-page-text, #e8eaed);
  text-align: center;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
}
.emg-title {
  margin: 0 0 12px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.35;
}
.emg-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}
.emg-desc {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--fb-muted, #9ca3af);
  text-align: left;
}
.emg-desc strong {
  color: var(--fb-modal-text, #e5e7eb);
}
.emg-desc code {
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--fb-surface-a, #111827);
  border: 1px solid var(--fb-border, #374151);
}
.muted {
  color: var(--fb-muted, #9ca3af);
}
.emg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-top: 18px;
}
.emg-btn-primary {
  border: none;
  border-radius: 6px;
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  background: #2563eb;
  color: #fff;
}
.emg-btn-primary:hover {
  filter: brightness(1.08);
}
.emg-btn-secondary {
  border: 1px solid var(--fb-border, #374151);
  border-radius: 6px;
  padding: 9px 16px;
  font-size: 14px;
  cursor: pointer;
  background: var(--fb-surface-a, #111827);
  color: var(--fb-page-text, #e8eaed);
}
.emg-btn-secondary:hover {
  border-color: var(--fb-link, #3b82f6);
  color: var(--fb-link, #93c5fd);
}
.emg-spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 16px;
  border: 3px solid rgba(147, 197, 253, 0.25);
  border-top-color: #60a5fa;
  border-radius: 50%;
  animation: emg-spin 0.75s linear infinite;
}
@keyframes emg-spin {
  to {
    transform: rotate(360deg);
  }
}
.emg-slot {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
</style>

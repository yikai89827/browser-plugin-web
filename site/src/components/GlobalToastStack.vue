<script setup lang="ts">
import { dismissToast, useGlobalToastItems } from '../lib/globalToast';

const items = useGlobalToastItems();
</script>

<template>
  <div class="global-toast-stack" aria-live="polite">
    <TransitionGroup name="toast-slide" tag="div" class="global-toast-inner">
      <div
        v-for="t in items"
        :key="t.id"
        class="global-toast"
        :class="t.kind === 'success' ? 'global-toast--success' : 'global-toast--error'"
        role="status"
      >
        <span class="global-toast-icon" aria-hidden="true">
          <template v-if="t.kind === 'error'">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="10" fill="#e53935" />
              <path
                d="M6 6l8 8M14 6l-8 8"
                stroke="white"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </template>
          <template v-else>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="10" fill="#2e7d32" />
              <path d="M5 10l4 4 6-7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </template>
        </span>
        <span class="global-toast-msg">{{ t.message }}</span>
        <button type="button" class="global-toast-close" aria-label="关闭" @click="dismissToast(t.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.global-toast-stack {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10050;
  pointer-events: none;
  max-width: min(520px, calc(100vw - 2rem));
}

.global-toast-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.global-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.65rem 0.75rem 0.65rem 0.85rem;
  background: #fff;
  color: #1c1e21;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.08);
  font-size: 0.9375rem;
  line-height: 1.45;
  text-align: left;
}

.global-toast-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.global-toast-msg {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
}

.global-toast-close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #65676b;
  font-size: 1.35rem;
  line-height: 1;
  padding: 0 0.15rem;
  cursor: pointer;
  border-radius: 4px;
}

.global-toast-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #1c1e21;
}

.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.22s ease;
}

.toast-slide-enter-from,
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.theme-dark .global-toast {
  background: #2d333b;
  color: #e8eaed;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.45);
}

.theme-dark .global-toast-close {
  color: #9aa0a6;
}

.theme-dark .global-toast-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e8eaed;
}
</style>

<script setup lang="ts">
import { ref } from 'vue';
import { browser } from 'wxt/browser';

const adminUrl = import.meta.env.WXT_ADMIN_URL || 'http://192.168.110.77:3000/';

const switchToNewBM = async () => {
  console.log('切换到BM新界面');
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await browser.tabs.update(tabs[0].id, { url: 'https://business.facebook.com/latest/business_manager' });
    }
  } catch (error) {
    console.error('切换失败:', error);
  }
};

const switchToOldBM = async () => {
  console.log('切换到BM旧界面');
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await browser.tabs.update(tabs[0].id, { url: 'https://business.facebook.com/business_manager' });
    }
  } catch (error) {
    console.error('切换失败:', error);
  }
};

const openAdmin = async () => {
  console.log('打开管理后台:', adminUrl);
  try {
    await browser.tabs.create({ url: adminUrl });
  } catch (error) {
    console.error('打开后台失败:', error);
  }
};
</script>

<template>
  <div class="popup-container">
    <header class="header">
      <div class="brand-row">
        <span class="logo" aria-hidden="true">🕷️</span>
        <span class="title">fbControl</span>
      </div>
      <p class="subtitle">便捷操作面板</p>
    </header>

    <div class="button-area">
      <div class="switch-buttons">
        <button type="button" class="switch-btn" @click="switchToNewBM">
          <span class="arrow">→</span>
          <span>切换到BM新界面</span>
        </button>
        <button type="button" class="switch-btn" @click="switchToOldBM">
          <span class="arrow">←</span>
          <span>切换到BM旧界面</span>
        </button>
      </div>

      <button type="button" class="admin-btn" @click="openAdmin">
        <span class="icon" aria-hidden="true">📊</span>
        <span>打开 fbControl 控制台</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.popup-container {
  width: 300px;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 14px 14px 14px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  margin-bottom: 14px;
  padding: 0 2px;
}

.brand-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.logo {
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
}

.title {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
  line-height: 1.2;
}

.subtitle {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.3;
}

.button-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.switch-buttons {
  display: flex;
  gap: 8px;
}

.switch-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 8px;
  background: #2a2a4a;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.switch-btn:hover {
  background: #3a3a6a;
}

.switch-btn:active {
  transform: scale(0.98);
}

.arrow {
  font-size: 13px;
  color: #4facfe;
  flex-shrink: 0;
}

.admin-btn {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.2s ease, transform 0.2s ease;
  box-shadow: 0 3px 12px rgba(79, 172, 254, 0.35);
}

.admin-btn:hover {
  filter: brightness(1.05);
}

.admin-btn:active {
  transform: scale(0.99);
}

.icon {
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}
</style>

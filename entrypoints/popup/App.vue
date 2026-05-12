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
    <!-- 头部 -->
    <div class="header">
      <div class="logo-section">
        <span class="logo">🕷️</span>
        <span class="title">fbControl</span>
        <span class="subtitle">便捷操作面板</span>
      </div>
    </div>
    
    <!-- 功能按钮区域 -->
    <div class="button-area">
      <!-- 切换按钮组 -->
      <div class="switch-buttons">
        <button class="switch-btn" @click="switchToNewBM">
          <span class="arrow">→</span>
          <span>切换到BM新界面</span>
        </button>
        <button class="switch-btn" @click="switchToOldBM">
          <span class="arrow">←</span>
          <span>切换到BM旧界面</span>
        </button>
      </div>
      
      <!-- 打开后台按钮 -->
      <button class="admin-btn" @click="openAdmin">
        <span class="icon">📊</span>
        <span>打开 fbControl 控制台</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.popup-container {
  width: 320px;
  min-height: 200px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  padding: 20px;
  box-sizing: border-box;
}

.header {
  text-align: center;
  margin-bottom: 20px;
}

.logo-section {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.logo {
  font-size: 24px;
}

.title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 1px;
}

.subtitle {
  font-size: 12px;
  color: #8b8b8b;
  margin-left: 4px;
}

.button-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.switch-buttons {
  display: flex;
  gap: 10px;
}

.switch-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 10px;
  background: #2a2a4a;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.switch-btn:hover {
  background: #3a3a6a;
  transform: translateY(-2px);
}

.arrow {
  font-size: 14px;
  color: #4facfe;
}

.admin-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(79, 172, 254, 0.4);
}

.admin-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 172, 254, 0.6);
}

.icon {
  font-size: 18px;
}
</style>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { browser } from 'wxt/browser';
import LoginBox from './login/index.vue';
import AdsManager from './ads/index.vue';
import ReportManager from './reporting/index.vue';
console.log('插件加载完成')

const activeTab = ref('ads'); // 默认显示广告管理页面

// 根据当前页面地址设置活动标签
onMounted(() => {
  browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      const url = tabs[0].url;
      if (url.includes('/adsmanager/reporting/')) {
        activeTab.value = 'report';
      } else if (url.includes('/adsmanager/manage/')) {
        activeTab.value = 'ads';
      }
    }
  });
});
</script>

<template>
  <div class="app-container">
    <!-- 导航标签 -->
    <!-- <div class="nav-tabs">
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'login' }" 
        @click="activeTab = 'login'"
      >
        登录
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'ads' }" 
        @click="activeTab = 'ads'"
      >
        广告管理
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'report' }" 
        @click="activeTab = 'report'"
      >
        广告报表
      </button>
    </div> -->
    
    <!-- 内容区域 -->
    <div class="content">
      <LoginBox v-if="activeTab === 'login'" />
      <AdsManager v-if="activeTab === 'ads'" />
      <ReportManager v-if="activeTab === 'report'" />
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  min-height: 500px;
}

.nav-tabs {
  display: flex;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 20px;
}

.tab-btn {
  padding: 10px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  border-bottom: 2px solid transparent;
  transition: all 0.3s;
}

.tab-btn:hover {
  color: #1890ff;
}

.tab-btn.active {
  color: #1890ff;
  border-bottom-color: #1890ff;
  font-weight: 600;
}

</style>

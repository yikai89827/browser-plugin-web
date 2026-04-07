<script lang="ts" setup>
import { ref } from 'vue';
import LoginBox from './login/index.vue';
import AdsManager from './ads/index.vue';
console.log('插件加载完成')

const activeTab = ref('ads'); // 默认显示广告管理页面
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
    </div> -->
    
    <!-- 内容区域 -->
    <div class="content">
      <!-- <LoginBox v-if="activeTab === 'login'" /> -->
      <AdsManager v-if="activeTab === 'ads'" />
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 1000px;
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

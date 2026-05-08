<script setup>
const message = 'FB广告管理';
</script>

<template>
  <div class="app-container">
    <div class="header">
      <h1>{{ message }}</h1>
    </div>
    <div class="content">
      <p>欢迎使用FB广告管理插件</p>
      <p>请访问Facebook广告页面以获取账户和像素信息</p>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  min-height: 400px;
  background: #f5f5f5;
}

.header {
  background: #1890ff;
  color: white;
  padding: 16px;
  text-align: center;
}

.header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.content {
  padding: 20px;
  text-align: center;
  color: #333;
}

.content p {
  margin: 10px 0;
  font-size: 14px;
}
</style>

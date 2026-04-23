<script lang="ts" setup>
// import { ref, onMounted } from "vue";
import { browser } from "wxt/browser";
import LoginBox from "./components/loginBox.vue";
import { Connect } from "../../../utils/connect/content";
import { onMounted, ref } from "vue";
import { browserStorage } from "../../../utils/storage";

const Connection = new Connect('popup')

const closePopup = () => {
  window.close();
};
const isLogin = ref(false)
const pluginRange = ref('')
const startWorker = async () => {
  isLogin.value = true
  console.log("插件id:", browser?.runtime?.id);
  browserStorage.set('lyPluginRange','全天')
  Connection.actions.start()
};
const loginFailure=(error:any)=>{
  console.error('登录失败')
}
const stopWorker = async ()=>{
  isLogin.value = false
  console.log("退出成功");
  console.log("插件id:", browser?.runtime?.id);
  Connection.actions.stop()
}
onMounted(async () => {
  const orgName = await browserStorage.get("lyPluginIsLogin") || '';
  isLogin.value = Boolean(orgName);
  pluginRange.value = await browserStorage.get('lyPluginRange') || '全天'
});
</script>

<template>
  <div class="title">
    <span>浏览器助手</span>
    <div class="close" @click="closePopup">
      <svg
        class="icon"
        viewBox="0 0 1024 1024"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M837.22 240.77L565.98 511.99 837.2 783.24c9.64 9.64 13.42 23.7 9.88 36.87a38.175 38.175 0 0 1-27 26.99 38.153 38.153 0 0 1-36.87-9.88L511.99 565.97 240.77 837.19c-9.64 9.64-23.7 13.42-36.87 9.88s-23.47-13.83-27-27a38.2 38.2 0 0 1 9.88-36.87L458 511.99 186.78 240.77c-14.91-14.91-14.91-39.08 0-53.99 14.91-14.91 39.08-14.91 53.99 0L511.98 458l271.25-271.22c14.91-14.91 39.08-14.91 53.99 0 14.91 14.91 14.91 39.08 0 53.99z"
          fill="#262626"
        ></path>
      </svg>
    </div>
  </div>

  <LoginBox @loginSuccess="startWorker" @loginFailure="loginFailure" @logoutFinish="stopWorker"></LoginBox>
</template>

<style scoped>
.title {
  border-bottom: 1px solid #ccc;
  padding: 15px;
  position: relative;
  font-size: 24px;
}
.close {
  width: 20px;
  height: 20px;
  color: #333;
  position: absolute;
  top: 15px;
  right: 30px;
  font-size: 24px;
  cursor: pointer;
}
.footer-btn {
  font-size: 1em;
  font-weight: 400;
  font-family: inherit;
  background-color: #fff;
  cursor: pointer;
  color: #1890ff;
}
.footer-btn:hover {
  transition: border-color 0.5s;
  font-weight: bold;
  text-decoration: underline;
}
</style>

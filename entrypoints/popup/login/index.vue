<script lang="ts" setup>
// import { ref, onMounted } from "vue";
import { exportToExcel } from "../../../utils/excelExport";
import { browser } from "wxt/browser";
import LoginBox from "./components/loginBox.vue";
import { Connect } from "../../../utils/connect/content";
import { onMounted, ref } from "vue";
import { browserStorage } from "../../../utils/storage";

const Connection = new Connect('popup')

const closePopup = () => {
  window.close();
};
const data = [
  {
    country: "中国",
    title: "四大古都法国队复合风管火锅1",
    discount: "10%",
  },
  {
    country: "美国",
    title:
      "四大古都法国队复合风管火锅时代发生的官方大哥发的根深蒂固东风股份大概的风格的风格堆放高度2",
    discount: "14%",
  },
  {
    country: "法国",
    title: "四大古都法国队复合风管火锅山东高速冬瓜豆腐3",
    discount: "11%",
  },
];
//导出数据
const exportData = () => {
  // exportToExcel(data)//test
  console.log('导出数据')
  Connection.actions.export()
  Connection.watchMessage((msg:{action:string,data:any}) => {
    const {action,data} = msg
    if(action==='export'){
      exportToExcel(data)
    }
  }); 
};
const isLogin = ref(false)
const isShow = ref(false)
const taskTimeRange = ref('')
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
const showtimeBox = ()=>{
  isShow.value = true
}
const taskTimeRangeChange = (e)=>{
  console.log(e.target.value)
  taskTimeRange.value = e.target.value
}
const confirmModify = ()=>{
  pluginRange.value = taskTimeRange.value
  isShow.value = false
  browserStorage.set('lyPluginRange',taskTimeRange.value)
}
onMounted(async () => {
  const orgName = await browserStorage.get("lyPluginIsLogin") || '';
  isLogin.value = Boolean(orgName);
  pluginRange.value = await browserStorage.get('lyPluginRange') || '全天'
});
</script>

<template>
  <div class="title">
    <span>ERP助手</span>
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
  <p v-if="isShow" style="display: flex; gap: 20px;">
    <label style="display: flex; align-items: center; cursor: pointer;">
      <input 
        v-model="pluginRange"
        type="radio" 
        name="taskTimeGroup" 
        value="全天" 
        style="margin-right: 8px;"
        @click="taskTimeRangeChange"
      >
      全天
    </label>
    <label style="display: flex; align-items: center; cursor: pointer;">
      <input
        v-model="pluginRange" 
        type="radio" 
        name="taskTimeGroup" 
        value="晚上9:00至早上9:00"
        style="margin-right: 8px;"
        @click="taskTimeRangeChange"
      >
      晚上9:00至早上9:00
    </label>
    <label style="display: flex; align-items: center; cursor: pointer;">
      <input
        v-model="pluginRange" 
        type="radio" 
        name="taskTimeGroup" 
        value="晚上9:00至早上9:00"
        style="margin-right: 8px;"
        @click="taskTimeRangeChange"
      >
      早上9:00至晚上9:00
    </label>
    <span @click="confirmModify" class="footer-btn">确定</span> 
  </p>
  <p >
    <span style="color:red">
      注：当前任务时间为 {{pluginRange}} 
      <!-- 【 <span @click="showtimeBox" class="footer-btn">修改时间</span> 】 -->
      ，请保持浏览器开启。如需立即获取点击
    </span> 
    【 <span @click="startWorker" class="footer-btn">立即获取</span> 】 
    【 <span @click="exportData" class="footer-btn"> 导出数据 </span> 】
  </p>
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

<script lang="ts" setup>
import { ref, onMounted } from "vue";
// import { SYS_API } from "../../../../apis/apiUrl";
// import { http } from "../../../../utils/connect/fetch";
import { browserStorage } from "../../../../utils/storage/index";
import { Connect } from "../../../../utils/connect/content";
// import { showchangeSiteBox, showExportBox } from "../../../../utils/modal";
const emits = defineEmits(["loginSuccess", "logoutFinish", "loginFailure"]);

const Connection = new Connect("popup-login");
const loginForm = ref({
  username: "",
  password: "",
  rememberMe: false,
  // mode: "none",
});
const orgName = ref("");
const isLogin = ref(false);
const errorInfo = ref({
  username:'',
  password:'',
  FailureInfo:''
});
const taskStatus = ref(false)
const reset = () => {
  loginForm.value = {
    username: "",
    password: "",
    rememberMe: false,
    // mode: "none",
  };
};
const loginResult = async (res: any) => {
  if (res.code == 200 && res.data) {
    orgName.value = res.data.orgName;
    isLogin.value = true;
    await browserStorage.set("lyPluginIsLogin", res.data.orgName);
    taskStatus.value = true
    emits("loginSuccess");
    reset();
  } else {
    errorInfo.value.FailureInfo = res.msg || '登录失败'
    emits("loginFailure");
  }
};
// @ts-ignore
const login = async () => {
  try {
    errorInfo.value =  {
      username:'',
      password:'',
      FailureInfo:''
    }
    if (!loginForm.value.username || !loginForm.value.password) {
      if(!loginForm.value.username) {
        errorInfo.value.username = '请输入账号/手机号'
      }
      if(!loginForm.value.password) {
        errorInfo.value.password = '请输入密码'
      }
      console.log("请输入用户名或密码！")
      Connection.actions.start(); //调试代码
    }else {
      console.log("登录");
      Connection.actions.login(loginForm.value); //通知后台worker登录
      Connection.watchMessage((msg:{action:string,data:any}) => {
        if(msg?.action==='login'){
          loginResult(msg?.data);
        }
      }); //后台worker响应
      // const res: any = await http.post(SYS_API.Login, loginForm.value);
      // console.log("登录结果", res);
      // loginResult(res);
    }
  } catch (error) {
    console.log(error)
    errorInfo.value.FailureInfo = '登录失败'
    emits("loginFailure");
  }
};
const logout = async () => {
  console.log("退出");
  Connection.actions.logout(); //通知后台worker退出
  Connection.watchMessage((msg:{action:string,data:any}) => {
    if(msg?.action==='logout'){
      if (msg?.data?.code == 200) {
        Connection.stopTimer()
        emits("logoutFinish");
        isLogin.value = false;
        browserStorage.set("lyPluginIsLogin", "");
        reset();
      }
    }
  }); //后台worker响应
  // const res: any = await http.get(SYS_API.Logout, loginForm.value);
  // console.log("退出结果", res);
  // if (res.code == 200) {
  //   emits("logoutFinish");
  //   isLogin.value = false;
  //   browserStorage.set("lyPluginIsLogin", "");
  //   reset();
  // }
};
const ctrlTask = ()=>{
  taskStatus.value = !taskStatus.value
  Connection.actions.ctrlTaskStatus(taskStatus.value); 
  Connection.watchMessage((msg:{action:string,data:any}) => {
    if(msg?.action==='ctrlTaskStatus'){
      // console.log("后台worker响应", msg);
      loginResult(msg?.data);
    }
  }); 
}
onMounted(async () => {
  orgName.value = (await browserStorage.get("lyPluginIsLogin")) || "";
  isLogin.value = Boolean(orgName.value);
  taskStatus.value = isLogin.value
});
</script>

<template>
  <div v-if="!isLogin" class="login-form">
    <input
      type="text"
      placeholder="请输入账号/手机号"
      v-model="loginForm.username"
    />
    <div class="login-error">{{errorInfo.username}}</div>
    <input
      type="password"
      class="pwd"
      placeholder="请输入密码"
      v-model="loginForm.password"
      @keyup.enter="login"
    />
    <div class="login-error">{{errorInfo.password}}</div>
    <button class="submit" @click="login">登录</button>
    <div class="login-error">{{errorInfo.FailureInfo}}</div>
  </div>
  <div v-else class="login-form is-login">
    <div class="user-info">
      <div class="login-status">{{ orgName }}</div>
      <div class="logout" @click="logout">退出</div>
    </div>
    <div class="status-text">{{ taskStatus?'任务运行中...':'任务已暂停' }} <span @click="ctrlTask" class="ctrl-btn" :class="taskStatus?'paused':'running'">{{taskStatus?'暂停':'开启'}}</span></div>
  </div>
</template>

<style scoped>
.login-form {
  width: 360px;
  height: 300px;
  padding: 30px 15px 15px;
  border-radius: 8px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-direction: column;
  font-size: 14px;
}

.login-error {
  width: 100%;
  height: 30px;
  line-height: 30px;
  text-align: left;
  color: red;
  padding-left: 20px;
}
.is-login.login-form {
  display: flex;
  align-items: center;
  flex-direction: column;
}
.user-info {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.user-info div {
  width: 50%;
}
.login-status {
  text-align: left;
}
.logout {
  color: #1890ff;
  text-align: right;
}
.ctrl-btn {
  margin-left: 5px;
}
.ctrl-btn:hover{
  text-decoration: underline;
}
.ctrl-btn.paused {
  color: red;
  cursor: pointer;
}
.ctrl-btn.running {
  color: green;
  cursor: pointer;
}
.logout:hover {
  text-decoration: underline;
  cursor: pointer;
}
.status-text {
  height: 200px;
  line-height: 200px;
  font-size: 16px;
}

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

.login-form input {
  width: 100%;
  padding: 15px;
  border-radius: 8px;
  box-sizing: border-box;
  border: 1px solid #ccc;
  color: #333;
}

.login-form input:hover,
.login-form input:focus-visible {
  border: 1px solid#1890ff !important;
  outline: #1890ff;
  box-shadow: 0 0 0 1px #1890ff;
}

.login-form .submit {
  width: 100%;
  height: 50px;
  margin-top: 30px;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1890ff;
  border-color: #1890ff;
  cursor: pointer;
  transition: border-color 0.25s;
  color: #fff;
}
.login-form .submit:hover {
  border-color: #1890ff;
  box-shadow: 0 0 2px #1890ff;
}
.status {
  font-size: 16px;
  color: #1890ff;
}
</style>

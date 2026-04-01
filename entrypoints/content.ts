import { Connect } from '../utils/connect/content';
import { hostPermissions } from '../config/wxtConfig';
import { showchangeSiteBox, showExportBox } from '../utils/modal';
import { isClickInsideTarget } from '../utils';
// import { browser } from 'wxt/browser';
// import { buttonClick } from '../utils/scraper/simulateButtonClick'
// import { captureIframeConsole, createIframe, iframeConsole } from '../utils/scraper/ctrlIframe';
// import { browser } from 'wxt/browser';
// import { browserStorage } from '../utils/storage';
// @ts-ignore
export default defineContentScript({
  // 'http://192.168.110.46*',
  matches: [
    // '*://*.baidu.com/*',
    ...hostPermissions,
  ],
  async main(ctx) {
    try {
      console.log('Initial load:', ctx?.isValid);
      console.log('Content script loaded', ctx?.contentScriptName, window.location.href)
      if (!document.querySelector('.debug-indicator-element')) {
        const tagDiv = document.createElement('div');
        tagDiv.className = 'debug-indicator-element'
        tagDiv.innerText = 'debug-indicator-element';
        document.head.appendChild(tagDiv)
        const Connection = new Connect('content')
        const url = Connection.getCurrentUrl();
        console.log('Content script loaded url', url, document.location.pathname, document.location)
        //@ts-ignore
        const currentLanguage = document.querySelector('.locale-icon-wrapper')?.innerText
        console.log('当前语言', currentLanguage)
        // Connection.actions.changeLanguage()
        if (currentLanguage&&currentLanguage !== 'zh') {
          Connection.actions.changeLanguage()
        }
        Connection.initTimer()
        Connection.watchMessage((msg: { action: string, data: any }) => {
          if (msg?.action === 'showNotifyBox') {
            showchangeSiteBox(true)//切换站点提醒框
          }
          if (msg?.action === 'showExportBox') {
            showExportBox(true)//导出提示框
          }
        });
        // showchangeSiteBox(true)//插入提醒框
        // showExportBox(true)//导出提示框
        document.addEventListener("click", (e)=> {
          console.log('partner-switcher-container', e.target)
          if (isClickInsideTarget(e, 'partner-switcher-container')) {
            console.log('用户点击国家列表，即将切换国家站点');
            Connection.actions.pageCtrlTaskStatus(false); 
          }
        });
      }
    } catch (error) {
      // console.log(error)
    }
    // const inIframe = Boolean(window.parent?.document?.querySelector("#iframeContentNode"))
    // console.log('browser.runtime', browser, browser.runtime)
    // if (!document.querySelector('.debug-indicator-element')) {
    // 监听页面状态变化
    // document.addEventListener('readystatechange', () => {
    // console.log('[CONTENT] 文档状态变化:', document.readyState);
    // if (document.readyState === 'complete') {
    // setTimeout(()=>{
    //   console.log('[CONTENT] 开始模拟点击操作', browser?.storage?.session?.get('is-btn-search'));
    //   buttonClick('.dropdown-account-switcher-container');
    // },10000)
    // if (!browser?.storage?.session?.get('is-btn-search')) {
    //   buttonClick('.btn-search')
    //   browser?.storage?.session?.set({ 'is-btn-search': true })
    // }
    // }
    // });
    // window.onload = async () => {
    //   try {
    //     if (inIframe) {
    //       console.log('当前页面在iframe中');
    //       const indicator = document.createElement('div');
    //       indicator.style = 'position:fixed;bottom:0;left:0;background:red;color:white;padding:5px;z-index:999999';
    //       indicator.textContent = '运行在iframe中';
    //       // browser.action?.setBadgeText({ text: "99+" });  // 显示"99+"文本
    //       // browser.action?.setBadgeBackgroundColor({ color: '#FF0000' });
    //     } else {
    //       const url = location.origin + '/home'
    //       console.log('location.origin', url)
    //       const iframeApp = createIframe(url, {
    //         // width: '50%',
    //         // height: '50%',
    //         // parent: document.querySelector('#app-container')
    //       }, async () => {
    //         console.log('iframe finished')
    //         Connection.actions.ping()
    //         // captureIframeConsole(iframeApp)
    //         // iframeConsole()//捕获iframe控制台日志
    //         // const response: any = await new Promise(resolve => {
    //         //   browser.runtime?.sendMessage({ type: 'switchSite', payload: '11111111111' }, resolve);
    //         // });
    //         // console.log('response', response);
    //       })
    //     }
    //     // // 初始化监听
    //     // browser.runtime?.onMessage.addListener(async (request, sender, sendResponse) => {
    //     //   console.log('后台请求：', request.action)
    //     //   return true;
    //     // });
    //     // browser.runtime?.sendMessage({
    //     //   action: "createTab",
    //     //   url: "https://www.baidu.com"
    //     // });
    //     // console.log('browser.runtime', browser.runtime);
    //     // browser.runtime?.sendMessage({ action: 'switchSite', payload: "https://www.baidu.com" }, (res => {
    //     //   console.log('接收响应', res);
    //     // }));
    //   } catch (error) {
    //     console.error(error)
    //   }
    // }
    // }
  },
});



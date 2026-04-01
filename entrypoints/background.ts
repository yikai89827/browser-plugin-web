import { browser } from 'wxt/browser';
import { getWebRequestHeaders, getWebResponseHeaders } from '../utils/connect/proxy'
import { Connection } from '../utils/connect/background'
import { initEvent } from '../utils/event'
// import { DB } from '../utils/storage/DB'
// import { mockCouponData } from '../utils/storage/mock'
// import { getConfig } from '../utils/scraper/fetchData'
// import { HttpClient } from '../utils/connect/fetch'
// import { browserStorage } from "../utils/storage";
// @ts-ignore
export default defineBackground({
  main() {
    console.log('Background script initialized,browser', browser);
    Connection.getTabId()
    getWebRequestHeaders()
    getWebResponseHeaders()
    initEvent()
    // 全局错误监控
    // window.addEventListener("message", (e) => {
    //   console.log(e)
    // });
    // try {
    // const timer = setInterval(async () => {
    //   const lyLocationOrigin = await browserStorage.get('lyLocationOrigin')
    //   console.log('%c lyLocationOrigin:', 'font-size:25px;background:#000;color:#fff;', lyLocationOrigin);
    //   const url = lyLocationOrigin + '/coupons/api/getCouponPromotions?paginationSize=25&paginationSkip=0'
    //   const header = await browserStorage.get('lyResponseHeadersToken')
    //   if (header) {
    //     console.log('%c url, header:', 'font-size:25px;background:#000;color:#fff;', url, header);
    //     clearInterval(timer)
    //   }
    // }, 1000)
    // const initData = async () => {
    //   const db = await DB()
    //   for (let i = 0; i < 10; i++) {
    //     db.add(mockCouponData(i + 1, 25));
    //   }
    // }
    // initData()
    // 获取所有数据
    // const allData = await DB.getAll();
    // console.log('allData', allData)
    // const count = await DB.getTotalCount();
    // console.log('getTotalCount', count)
    // const count2 = await DB.getAllByCountry('US');
    // console.log('getAllByCountry', count2)
    // // 查询数据
    // const data = await DB.get('uk_1');

    // console.log('data', data)
    // } catch (error) {
    //   console.error(error)
    // }
    // 初始化监听
    // browser.runtime?.onMessage.addListener(async (request, sender, sendResponse) => {
    //   // if (!sender.origin?.startsWith('browser-extension://')) {
    //   //   return false; // 拒绝外部请求
    //   // }
    //   console.log('页面请求：', request.url, sender.origin)
    //   if (request.action === 'switchSite') {
    //     console.log('Received message:', request);
    //     sendResponse({ action: 'switchSite', status: 'ACK' });
    //   }
    //   if (request.action === "createTab") {
    //     const res = await browser.storage.session.get('loadTimes')
    //     console.log('创建标签页成功', res)
    //     if (!res?.loadTimes) {
    //       browser.storage.session.set({ loadTimes: true })
    //       browser.tabs.create({ url: request.url, active: false, });
    //       sendResponse({ action: 'createTab', status: '创建标签页成功' });
    //     }
    //   }
    //   return true;
    // });
    // 监听新标签页创建
    // browser.tabs.onCreated.addListener(async (tab: any) => {
    //   // 创建新分组
    //   const groupId = await browser.tabs.group({ tabIds: [tab.id] });
    //   await browser.tabGroups.update(groupId, { collapsed: true });
    //   console.log('tab',tab)
    //   // browser.runtime?.sendMessage({ action: 'updateData', payload: "插件创建的标签页" })
    //   // if (tab.incognito || tab.url.includes("chrome-extension://")) {
    //   //   console.log("插件创建的标签页", tab.id);
    //   //   browser.runtime?.sendMessage({ action: 'updateData', payload: "插件创建的标签页" })
    //   // }
    // });
  }
});


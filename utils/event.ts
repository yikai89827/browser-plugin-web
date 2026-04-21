import { browser } from 'wxt/browser';

export const initEvent = ()=>{
    try {
        if (browser.runtime && browser.runtime.onInstalled) {
            browser.runtime.onInstalled.addListener((details) => {
                if (details.reason === "install") {
                    console.log("窗口被安装!");
                } else if (details.reason === "update") {
                    console.log("窗口被更新!");
                }
            });
        }
        if (browser.runtime && browser.runtime.onStartup) {
            browser.runtime.onStartup.addListener(() => {
                console.log("浏览器启动时!");
            });
        }
    } catch (error) {
        console.error('初始化事件失败:', error);
    }
}

// 显示通知红点
export const showNotificationBadge = async (count?: number)=> {
    try {
        console.log('setBadgeText', browser, browser.browserAction)
        await browser.action?.setBadgeText({
            text: count ? String(count) : '●' // 数字或圆点
        });
        await browser.action?.setBadgeBackgroundColor({
            color: '#FF0000' // 红色背景
        });
        await browser.action?.setBadgeTextColor({
            color: '#FFFFFF' // 文字颜色
        });
    } catch (error) {
        console.error('设置通知红点失败:', error);
    }
}

// 隐藏红点
export const hideNotificationBadge = async ()=> {
    try {
        await browser.action?.setBadgeText({ text: '' });
    } catch (error) {
        console.error('清除通知红点失败:', error);
    }
}
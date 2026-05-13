import { browser } from 'wxt/browser';
import { fbControlError, fbControlLog } from './fbControlLog';

/**
 * 注册扩展生命周期相关监听器（安装、更新、浏览器启动），用于调试或后续扩展。
 */
export const initEvent = () => {
  try {
    if (browser.runtime && browser.runtime.onInstalled) {
      browser.runtime.onInstalled.addListener((details) => {
        if (details.reason === 'install') {
          fbControlLog('event', '扩展已安装');
        } else if (details.reason === 'update') {
          fbControlLog('event', '扩展已更新', { previousVersion: details.previousVersion });
        }
      });
    }
    if (browser.runtime && browser.runtime.onStartup) {
      browser.runtime.onStartup.addListener(() => {
        fbControlLog('event', '浏览器启动（扩展 onStartup）');
      });
    }
  } catch (error) {
    fbControlError('event', 'initEvent 失败', error);
  }
};

/**
 * 在工具栏图标上显示红点或数字角标（需 manifest 声明 action）。
 */
export const showNotificationBadge = async (count?: number) => {
  try {
    fbControlLog('event', '设置角标', { count });
    await browser.action?.setBadgeText({
      text: count ? String(count) : '●',
    });
    await browser.action?.setBadgeBackgroundColor({
      color: '#FF0000',
    });
    await browser.action?.setBadgeTextColor({
      color: '#FFFFFF',
    });
  } catch (error) {
    fbControlError('event', '设置角标失败', error);
  }
};

/** 清除工具栏角标 */
export const hideNotificationBadge = async () => {
  try {
    await browser.action?.setBadgeText({ text: '' });
    fbControlLog('event', '角标已清除');
  } catch (error) {
    fbControlError('event', '清除角标失败', error);
  }
};

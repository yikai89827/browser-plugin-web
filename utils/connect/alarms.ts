import { browser } from 'wxt/browser';
export const setAlarmsTask = (alarmName: string, fn: Function, interval: number) => {
    console.log('setAlarmsTask', alarmName, interval)
    // 创建每1分钟执行任务
    browser?.alarms?.create(alarmName, {
        periodInMinutes: interval ? Number(interval) : 115//最低能设置一分钟,
    });

    // 监听定时任务启动，执行逻辑
    browser?.alarms?.onAlarm.addListener((alarm) => {
        console.log('alarm', alarm, alarm?.name)
        if (alarm?.name === alarmName) {
            fn && fn(alarm)
        }
    });
}

// https://sellercentral.amazon.de/coupons/api/merchantInfo
// https://sellercentral.amazon.de/coupons/api/config    currency
// getUrl("".concat(loggedUrl, "/home?mons_sel_dir_mcid=").concat(find.mons_sel_dir_mcid, "&mons_sel_mkid=").concat(find.marketplaceId, "&mons_sel_dir_paid=").concat(find.mons_sel_dir_paid), find.marketplaceId, loggedUrl, task.task_id);
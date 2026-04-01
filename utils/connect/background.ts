import { goNextTask } from './../scraper/setTask';
import { browser, Browser } from 'wxt/browser';
// import { exportList, exportToCsv } from "../../utils/excelExport";
import { DB } from '../../utils/storage/DB'
import { browserStorage } from "../../utils/storage";
import { SYS_API } from "../../apis/apiUrl";
import { http } from "../../utils/connect/fetch";
import { setAlarmsTask } from '../connect/alarms';
import { initTaskList, startTaskList } from '../scraper/setTask';
import { randomIntInRange } from '..';
import { changeLanguage } from '../scraper/fetchData';
import { hideNotificationBadge, showNotificationBadge } from '../../utils/event'
// @ts-ignore
const TIMEOUT = import.meta.env.WXT_API_TIMEOUT
// @ts-ignore
const interval = import.meta?.env?.WXT_TASK_INTERVAL

const mockLogin = async () => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                code: 200,
                msg: '登录成功',
                data: {
                    token: '123456',
                    orgName: 'erp管理员',
                }
            })
        }, interval);
    })
}

let lastHeartbeat = 0;
/**
 * 内容脚本和后台脚本的长连接
 */
export class Connect<T> {
    private tabId: number = 0
    private activePorts = new Map<any, Browser.runtime.Port>()
    private port
    constructor() {
        this.init()
    }
    init() {
        browser.runtime?.onConnect?.addListener((port) => {
            console.log('port, port.name', port, port.name)
            // this.activePorts.set(port.name, port)
            // browser.runtime.getBackgroundPage(); // 保持后台页面激活
            this.activePorts.set(port.sender?.tab?.id, port);
            this.port = port
            this.port.onDisconnect.addListener(() => {
                this.activePorts.delete(this.port.name)
                console.log('连接断开:', port)
            })
            const recieves = {
                async ping(data: any) {
                    // console.log('ping', data)
                    setTimeout(() => {
                        const now = Date.now()
                        // console.log('Timeout', TIMEOUT, now - lastHeartbeat)
                        if (now - lastHeartbeat > TIMEOUT) {
                            console.log('连接超时断开', TIMEOUT, now, lastHeartbeat, now - lastHeartbeat)
                            port.disconnect();
                        }
                    }, 3000);
                },
                send(data: any) {
                    if (data?.includes('http')) {
                        console.log('send', data)
                        browserStorage.set('lyLocationOrigin', data)
                    }
                },
                async start() {
                    console.log('开始首次任务')
                    const taskList:any[] = await initTaskList()
                    await startTaskList(taskList)// 首次任务
                    setAlarmsTask('lyTimerTask', () => {//启动定时任务
                        console.log('定时任务延时执行')
                        setTimeout(async () => {
                            await browserStorage.set('lyPageCtrlTaskStatus', '1')
                            const syncTaskInfo = await browserStorage.get('lySyncTaskInfo')
                            console.log('定时任务执行判断', syncTaskInfo)
                            if (!syncTaskInfo || (syncTaskInfo && !JSON.parse(syncTaskInfo)?.isRunning)) {
                                const isAmazonVerifycodePage = await browserStorage.get('lyAmazonVerifycodePage')
                                if (!isAmazonVerifycodePage) {
                                    console.log('开始执行定时任务')
                                    const taskList: any[] = await initTaskList()
                                    await startTaskList(taskList)// 执行定时任务
                                } else {
                                    console.log('亚马逊账户未登录  暂停任务')
                                }
                            } else {
                                console.log('%c 上一个任务还在运行中，任务将延时执行', 'background:#000;color:#fff;')
                            }
                        }, randomIntInRange(1000 * 60, 1000 * 60 * 10))
                    }, interval)
                },
                stop(data: any) {
                    console.log('停止任务', data)
                    browser?.alarms?.clearAll().then((result) => {
                        console.log("所有定时任务已停止", result);
                    });
                },
                async export(msg: any) {
                    console.log('导出', msg)
                    const db = await DB()
                    const data = await db.getAll()
                    // const data = await db.getAllByCountry('德国')
                    console.log('exportLocalList data', data)
                    const list = data.map((v: any) => v.list).flat()
                    console.log('exportLocalList list', list)
                    port?.postMessage({ action: 'export', data: list });
                    hideNotificationBadge()
                    // exportList(list)//导出excel
                    // exportToCsv(list)//导出csv
                },
                async login(loginForm: { username: string, password: string }) {//登录
                    console.log('登录', loginForm)
                    this.start()//测试代码 
                    try {
                        const { username, password } = loginForm
                        if (!username || !password) {
                            return console.log("请输入用户名或密码！");
                        }
                        // const res: any = await http.post(SYS_API.Login, loginForm);
                        const res = await mockLogin()
                        console.log("登录结果", res);
                        port?.postMessage({ action: 'login', data: res });
                        if (res?.code == 200) {
                            browserStorage.set('lyCtrlTaskStatus', '1')
                            this.start()
                        }
                    } catch (error) {
                        console.error("登录失败", error);
                        port?.postMessage({ action: 'login', data: error });
                    }
                },
                async logout() {//退出
                    console.log('退出账户')
                    try {
                        const res: any = await http.get(SYS_API.Logout, {});
                        console.log("退出结果", res);
                        if (res?.code == 200) {
                            await browserStorage.set('lyCtrlTaskStatus', '')
                            this.stop()
                            const syncTaskInfo = await browserStorage.get('lySyncTaskInfo')
                            if (syncTaskInfo) {
                                const newInfo = JSON.parse(syncTaskInfo)
                                newInfo.isRunning = false
                                browserStorage.set('lySyncTaskInfo', JSON.stringify(newInfo))
                            }
                        }
                        port?.postMessage({ action: 'logout', data: res });
                    } catch (error) {
                        console.error("退出失败", error);
                        port?.postMessage({ action: 'logout', data: error });
                    }
                },
                async ctrlTaskStatus(data) {//任务控制===永久暂停
                    console.log('任务控制', data ? '开启' : '暂停')
                    browserStorage.set('lyCtrlTaskStatus', data ? '1' : '')
                },
                async pageCtrlTaskStatus(data) {//页面任务控制=== 暂停一个定时任务间隔
                    console.log('页面任务控制', data ? '开启' : '暂停')
                    port?.postMessage({ action: 'pageCtrlTaskStatus', data: Date.now() });
                    browserStorage.set('lyPageCtrlTaskStatus', data ? '1' : '')
                },
                async changeLanguage() {//切换语言
                    console.log('切换语言')
                    changeLanguage('zh_CN')
                },
                async nextTask(){//执行下一个任务
                    console.log('执行下一个任务')
                    goNextTask()
                }
            }
            port?.onMessage?.addListener((msg) => {
                // console.log('后台收到长连接消息', msg)
                if (msg?.action === "ping") {
                    lastHeartbeat = msg?.data;
                    port?.postMessage({ action: 'ping', data: Date.now() });
                }
                recieves[msg?.action] && recieves[msg?.action](msg?.data)
            });
            return true
        });
    }
    // 监听消息
    watchMessage(fn?: Function) {
        this.port?.onMessage?.addListener((msg) => {
            // console.log('content收到长连接消息', msg)
            fn && fn(msg)
        });
    }
    //获取页签id
    getTabId() {
        browser?.action?.onClicked?.addListener((tab: any) => {
            console.log("当前标签页ID:", tab?.id);
            this.tabId = tab?.id
        });
    }
    //广播消息
    broadcastToContent(message) {
        this.activePorts.forEach(port => {
            console.log('broadcastToContent', port?.name, message)
            if (message?.action?.includes('showExportBox')){
                showNotificationBadge()
            }
            try {
                port.postMessage(message);
            } catch (err) {
                console.log('broadcast消息发送失败:', err);
                this.activePorts.delete(port);
            }
        });
    }
}
export const Connection = new Connect
import { Browser, browser } from 'wxt/browser';
import { hideNotificationBadge } from '../event';
// import { siteArray } from '../../config/base'
// @ts-ignore
const HEARTBEAT = import.meta.env.WXT_API_HEARTBEAT
// @ts-ignore
const CONNECTNAME = import.meta.env.WXT_API_CONNECTNAME
/**
 * 内容脚本和后台脚本的长连接
 */
export class Connect<T> {
    private timer: string | number | NodeJS.Timeout | undefined;
    private port: Browser.runtime.Port;
    public actions: { send: any; ping: any; start: any; export: any; stop: any, login: any, logout: any, ctrlTaskStatus: any, changeLanguage: any, pageCtrlTaskStatus: any, nextTask: any }
    private retryCount = 1
    constructor(connectionName: string) {
        try {
            const name = CONNECTNAME + '-' + connectionName
            console.log('name, baseURL', name, location.origin)
            console.log('ConnectionName', connectionName)
            this.port = browser.runtime?.connect({ name });
            this.sendMessage()
            if (location.origin.startsWith('http') && connectionName === 'content') {
                const url = this.getCurrentUrl()
                // console.log('url----', url)
                if (url?.length && url?.startsWith('http')) {
                    this.actions.send(url)
                }
            }
        } catch (error) {
            console.error(`初始化连接失败`, error)
        }
    }
    //发送消息
    sendMessage() {
        const sendMsg = (msg: { action: string, data: any }) => {
            // console.log('sendMsg', msg)
            try {
                this.port?.postMessage(msg);
            } catch (e) {
                console.error('content消息发送失败:', e);
                this.reconnectPort(this.port, this.retryCount + 1, msg)
            }
        }
        this.actions = {
            ping() {//心跳
                const msg = { action: 'ping', data: Date.now() }
                sendMsg(msg)
            },
            send(data: any) {//url
                const msg = { action: 'send', data }
                sendMsg(msg)
            },
            start() {//开始任务
                const msg = { action: 'start', data: Date.now() }
                sendMsg(msg)
            },
            stop() {//停止任务
                const msg = { action: 'stop', data: Date.now() }
                sendMsg(msg)
            },
            export() {//导出
                const msg = { action: 'export', data: Date.now() }
                hideNotificationBadge()
                sendMsg(msg)
            },
            login(data: any) {//后台程序登录
                const msg = { action: 'login', data }
                sendMsg(msg)
            },
            logout() {//后台程序退出
                const msg = { action: 'logout', data: Date.now() }
                sendMsg(msg)
            },
            ctrlTaskStatus(data) {//任务状态控制
                const msg = { action: 'ctrlTaskStatus', data }
                sendMsg(msg)
            },
            pageCtrlTaskStatus(data) {//页面任务状态控制
                const msg = { action: 'pageCtrlTaskStatus', data }
                sendMsg(msg)
            },
            changeLanguage() {//切换语言
                const msg = { action: 'changeLanguage', data: Date.now() }
                sendMsg(msg)
            },
            nextTask() {//切换下一个任务
                const msg = { action: 'nextTask', data: Date.now() }
                sendMsg(msg)
            }
        }
    }
    // 监听消息
    watchMessage(fn?: Function) {
        this.port?.onMessage?.addListener((msg) => {
            // console.log('页面收到后台的长连接消息', msg)
            fn && fn(msg)
        });
    }
    //3次重连
    reconnectPort(port: Browser.runtime.Port, retry: number, msg?: { action: string, data: any }) {
        if (retry > 3) {
            clearInterval(this.timer)
            return false;
        }
        console.log('reconnectPort', retry)
        this.port = browser.runtime.connect({ name: port.name });
        if (msg) {
            this.actions[msg?.action](msg)
        }
        this.port?.onDisconnect?.addListener(() => {
            clearInterval(this.timer)
            console.log('连接已断开，准备重连...', retry);
            setTimeout(() => this.reconnectPort(this.port, retry + 1), 1000 * retry);
        });
    };
    //获取当前url
    getCurrentUrl() {
        try {
            return window.parent.document.location.origin;
        } catch (e) {
            return document.location.origin;
        }
    }
    /**
     * 连接心跳
     */
    initTimer() {
        clearInterval(this.timer)
        this.timer = setInterval(() => {
            const url = this.getCurrentUrl()
            // console.log('HEARTBEAT----', url, HEARTBEAT)
            this.actions.ping()
            if (url?.length && url?.startsWith('http')) {
                // browserStorage.set('lyLocationOrigin', url)
                this.actions.send(url)
            }
        }, HEARTBEAT)
        // this.port?.onDisconnect?.addListener(() => {
        //     console.log('连接断开，心跳检测已停止')
        //     clearInterval(this.timer)
        //     this.reconnectPort(this.port);
        // })
    }
    //停止心跳
    stopTimer() {
        clearInterval(this.timer)
    }
    //销毁连接
    dispose() {
        // this.port?.clear
    }
}
// export const Connection = new Connect('content')
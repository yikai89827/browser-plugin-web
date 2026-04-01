import { browser } from 'wxt/browser';
/**
 * 内容脚本和后台脚本的长连接
 */
export class Connect<T> {
    private msgList: any[] = [];
    private timer;
    private port;
    private actions
    constructor() {
        this.port = browser.runtime?.connect({ name: "updateData" });
        this.actions = {
            ping() {
                this.port?.postMessage({ action: 'ping' });
            },
            init() {
                this.port?.postMessage({ action: 'init', data: "Connection established" });
            },
            sendJSON(data: any[]) {
                this.port?.postMessage({ action: 'sendJSON', data });
            }
        }
        const recieves = {
            ping(data: any) {
                this.msgList.push({ ping: data })
            },
            init(data: any) {
                this.msgList.push({ init: data })
            },
            sendJSON(data: any) {
                this.msgList.push({ init: data })
            }
        }
        this.actions.init()
        this.port?.onMessage.addListener((msg) => {
            console.log('收到长连接消息', msg)
            recieves[msg?.action] && recieves[msg?.action](msg?.data)
        });
    }
    sendJSON(data: any[]) {
        this.actions.sendJSON(data)
    }
    /**
     * 连接心跳
     */
    initTimer() {
        clearInterval(this.timer)
        this.timer = setInterval(() => {
            this.actions.ping()
        }, 1000 * 60 * 3)
    }
}
import { browser } from 'wxt/browser';
import { randomIntInRange } from '../index'
export const simulateButtonClick = async (tabId: number, selector: string) => {
    try {
        console.log('simulateButtonClick', tabId, selector, browser)
        if (!browser.debugger) {
            console.log('browser.debugger', browser.debugger)
            return
        }
        // 1. 附加调试会话
        await browser.debugger?.attach({ tabId }, '1.3', () => {
            console.log('browser.debugger', browser.debugger)
            if (browser.runtime?.lastError) {
                console.error('调试器附加失败:', browser.runtime?.lastError);
                return;
            }
        });

        // 2. 启用DOM域
        await browser.debugger?.sendCommand(
            { tabId },
            'DOM.enable'
        );

        // 3. 查找按钮元素
        const { nodeId }: any = await browser.debugger?.sendCommand(
            { tabId },
            'DOM.querySelector',
            { selector }
        );
        console.log('nodeId', nodeId)
        // 4. 模拟点击事件
        await browser.debugger?.sendCommand(
            { tabId },
            'DOM.dispatchMouseEvent',
            {
                nodeId,
                type: 'mousePressed',
                button: 'left',
                clickCount: 1
            }
        );
        // // 发送鼠标点击指令
        // browser.debugger.sendCommand(
        //     { tabId },
        //     'Input.dispatchMouseEvent',
        //     { type: 'mousePressed', x: 100, y: 200 },
        //     () => {
        //         // 释放调试器资源
        //         browser.debugger.detach({ tabId });
        //     }
        // );
    } catch (error) {
        console.error(error)
    } finally {
        await browser.debugger?.detach({ tabId });
    }
}
let timer
export const buttonClick = async (selector: string) => {
    try {
        console.log('buttonClick', selector, browser)
        clearTimeout(timer)
        setTimeout(() => {
            const node = document.querySelector(selector)
            // @ts-ignore
            node && node.click()
        }, randomIntInRange(800, 2000))
    } catch (error) {
        console.error(error)
    } finally {

    }
}
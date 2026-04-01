import { Connect } from '../utils/connect/content';
import { browserStorage } from './storage';
import { formatDate } from '../utils/index';
import { exportToExcel } from './excelExport';
/*
将 DOM 字符串转换为 DOM 节点并挂载到指定容器
* @param { string } domString - 有效的 HTML 字符串
* @param { string | Element } container - 容器选择器或 DOM 元素
*/
let timer
const mountDOM = (domString: string, container: string, id, fn) => {
    // 参数校验
    if (!domString || typeof domString !== 'string') {
        throw new Error('DOM 字符串参数无效');
    }

    // 获取容器元素
    let containerEl;
    if (typeof container === 'string') {
        containerEl = document.querySelector(container);
        if (!containerEl) {
            console.warn(`未找到容器元素: ${container}`);
            return;
        }
    }

    try {
        // 创建临时模板解析 HTML
        const template = document.createElement('template');
        template.innerHTML = domString.trim(); // 处理空白字符

        // 安全克隆节点（防止文档片段被重复使用）
        const fragment = document.importNode(template.content, true);

        // 挂载到容器
        containerEl.appendChild(fragment);
        document.querySelector(id)?.addEventListener('click', (e) => {
            console.log(e.target.id)
            fn && fn(e.target.id)
        });
        const Connection = new Connect('content')
        if (id === '#ly_change_site_popup') {
            timer = setTimeout(() => {
                document.querySelector(id)?.remove()
                browserStorage.set('notShowchangeSiteBoxDate', formatDate(new Date))
                Connection.actions.nextTask()
                // @ts-ignore
            }, import.meta?.env?.WXT_MODAL_TIMEOUT || 15000)
        }
        Connection.watchMessage((msg: { action: string, data: any }) => {
            if (msg?.action === 'showNotifyBox') {
                showchangeSiteBox(true)//切换站点提醒框
            }
            if (msg?.action === 'showExportBox') {
                showExportBox(true)//导出提示框
            }
        });
    } catch (error) {
        console.log('DOM 挂载失败:', error);
    }
}
const changeSiteTemplate =
    `
<div id="ly_change_site_popup" style="position: fixed; top: 20px; right: 20px; background-color: rgb(255, 255, 255); padding: 20px 30px 50px 20px; border-radius: 20px; box-shadow: rgba(0, 0, 0, 0.1) 0px 2px 4px 0px; z-index: 999999;">
    <header style="position: relative;margin-bottom: 20px;">
        <svg style="position: absolute;left:-24px;top:50%;transform: translateY(-50%);height:18px;width: 18px;" t="1709884599509" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="33205" width="200" height="200"><path d="M512 1024A512 512 0 1 0 512 0a512 512 0 0 0 0 1024z m-34.56-425.6L454.4 287.36c0-34.56 23.04-63.36 57.6-63.36 28.8 0 57.6 23.04 57.6 57.6l-23.04 316.8c-5.76 17.28-17.28 28.8-34.56 28.8s-28.8-11.52-34.56-28.8zM512 684.8c34.56 0 57.6 23.04 57.6 57.6s-23.04 57.6-57.6 57.6-57.6-23.04-57.6-57.6 23.04-57.6 57.6-57.6z" fill="#F58718" p-id="33206"></path></svg>
        <h5 style="text-align:left;margin: 0;font-size:18px;font-weight: 600;">插件切换站点提醒</h5>
    </header>
    <p style="text-align:left; margin:0 0 4px 0;font-size:12px;color:rgb(99,99,99)">插件任务执行中，即将切换站点。</p>
    <p style="text-align:left;margin: 0 0 16px 0;font-size:12px;color:rgb(99,99,99);">可选择以下操作：</p>
    <div id="ly_change_site_popup_stop" style="position:relative;padding: 12px 28px 12px 12px;margin-bottom:8px;font-size:14px;color:#F27A00;border:1px solid #F27A00;border-radius:4px;background:#FFF5E0;cursor: pointer;">
        暂停插件，可进行操作。2小时后插件继续执行。
        <svg style="position:absolute;right:8px;top:50%;transform: translateY(-50%);height:14px;width:14px" t="1710140693533" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="11187" width="200" height="200"><path d="M634.752 247.488l4.928 4.288L865.92 478.08a48 48 0 0 1 4.288 62.976l-4.288 4.864-226.24 226.304a48 48 0 0 1-72.192-62.976l4.288-4.928L716.16 560 192 560a48 48 0 0 1-6.528-95.552L192 464h524.096L571.776 319.616a48 48 0 0 1-4.288-62.976l4.288-4.928a48 48 0 0 1 62.976-4.288z" fill="#f27a00" p-id="11188"></path></svg>
    </div>
    <div id="ly_change_site_popup_close" style="position:relative;padding: 12px 28px 12px 12px;font-size:14px;color:#005bf5;border:1px solid #005bf5;border-radius:4px;background:#EBF3FF;cursor: pointer;">
        插件继续执行，不在页面进行操作。关闭此提醒, 且今日不再提醒。
        <svg style="position:absolute;right:8px;top:50%;transform: translateY(-50%);height:14px;width:14px" t="1710140693533" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="11187" width="200" height="200"><path d="M634.752 247.488l4.928 4.288L865.92 478.08a48 48 0 0 1 4.288 62.976l-4.288 4.864-226.24 226.304a48 48 0 0 1-72.192-62.976l4.288-4.928L716.16 560 192 560a48 48 0 0 1-6.528-95.552L192 464h524.096L571.776 319.616a48 48 0 0 1-4.288-62.976l4.288-4.928a48 48 0 0 1 62.976-4.288z" fill="#005bf5" p-id="11188"></path></svg>
    </div>

</div>
`
    // < div style = "position:absolute;bottom:12px;right:20px;color:#E52E2E;font-weight:600" > <input type="checkbox" id = "ly_change_site_popup_checkbox" style = "position:relative;top:3px;" >& nbsp;& nbsp; 今日不再提醒 </>
const exportDataTemplate =
    `
<div id="ly_export_data_popup" style="position: fixed; top: 20px; right: 20px; background-color: rgb(255, 255, 255); padding: 20px 30px 50px 40px; border-radius: 20px; box-shadow: rgba(0, 0, 0, 0.1) 0px 2px 4px 0px; z-index: 999999;">
    <header style="position: relative;margin-bottom: 20px;">
        <svg style="position: absolute;left:-24px;top:50%;transform: translateY(-50%);height:18px;width: 18px;" t="1709884599509" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="33205" width="200" height="200"><path d="M512 1024A512 512 0 1 0 512 0a512 512 0 0 0 0 1024z m-34.56-425.6L454.4 287.36c0-34.56 23.04-63.36 57.6-63.36 28.8 0 57.6 23.04 57.6 57.6l-23.04 316.8c-5.76 17.28-17.28 28.8-34.56 28.8s-28.8-11.52-34.56-28.8zM512 684.8c34.56 0 57.6 23.04 57.6 57.6s-23.04 57.6-57.6 57.6-57.6-23.04-57.6-57.6 23.04-57.6 57.6-57.6z" fill="#F58718" p-id="33206"></path></svg>
        <h5 style="margin: 0;font-size:18px;font-weight: 600;">数据获取完成提醒</h5>
    </header>
    <div id="ly_delay_export" style="position:relative;padding: 12px 28px 12px 12px;margin-bottom:8px;font-size:14px;color:#F27A00;border:1px solid #F27A00;border-radius:4px;background:#FFF5E0;cursor: pointer;">
        稍后自行打开插件，点击导出数据
        <svg style="position:absolute;right:8px;top:50%;transform: translateY(-50%);height:14px;width:14px" t="1710140693533" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="11187" width="200" height="200"><path d="M634.752 247.488l4.928 4.288L865.92 478.08a48 48 0 0 1 4.288 62.976l-4.288 4.864-226.24 226.304a48 48 0 0 1-72.192-62.976l4.288-4.928L716.16 560 192 560a48 48 0 0 1-6.528-95.552L192 464h524.096L571.776 319.616a48 48 0 0 1-4.288-62.976l4.288-4.928a48 48 0 0 1 62.976-4.288z" fill="#f27a00" p-id="11188"></path></svg>
    </div>
    <div id="ly_now_export" style="position:relative;padding: 12px 28px 12px 12px;font-size:14px;color:#005bf5;border:1px solid #005bf5;border-radius:4px;background:#EBF3FF;cursor: pointer;">
        立即导出数据
        <svg style="position:absolute;right:8px;top:50%;transform: translateY(-50%);height:14px;width:14px" t="1710140693533" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="11187" width="200" height="200"><path d="M634.752 247.488l4.928 4.288L865.92 478.08a48 48 0 0 1 4.288 62.976l-4.288 4.864-226.24 226.304a48 48 0 0 1-72.192-62.976l4.288-4.928L716.16 560 192 560a48 48 0 0 1-6.528-95.552L192 464h524.096L571.776 319.616a48 48 0 0 1-4.288-62.976l4.288-4.928a48 48 0 0 1 62.976-4.288z" fill="#005bf5" p-id="11188"></path></svg>
    </div>
</div>
`
export async function showchangeSiteBox(item) {
    console.log('showchangeSiteBox', item)
    if (item) {
        if (document.querySelector('#ly_change_site_popup')) {
            return
        }
        const notShowchangeSiteBox = await browserStorage.get('notShowchangeSiteBoxDate')
        const nowDate = formatDate(new Date)
        if (notShowchangeSiteBox === nowDate) {
            console.log('用户设置当天不提醒', nowDate)
            return
        }
        mountDOM(changeSiteTemplate, 'body', '#ly_change_site_popup', (id) => {
            const eventFunctions = {
                ly_change_site_popup_stop() {
                    console.log('停止任务')
                    document.querySelector('#ly_change_site_popup')?.remove()
                    const Connection = new Connect('content')
                    Connection.actions.pageCtrlTaskStatus(false)
                },
                ly_change_site_popup_close() {
                    console.log('关闭弹窗')
                    document.querySelector('#ly_change_site_popup')?.remove()
                    clearTimeout(timer)
                    browserStorage.set('notShowchangeSiteBoxDate', formatDate(new Date))
                    const Connection = new Connect('content')
                    Connection.actions.nextTask()
                },
                // ly_change_site_popup_checkbox() {
                //     console.log('今日不提醒')
                //     browserStorage.set('notShowchangeSiteBoxDate', formatDate(new Date))
                //     document.querySelector('#ly_change_site_popup')?.remove()
                // },
            }
            eventFunctions[id] && eventFunctions[id]()
        })
    } else {
        document.querySelector('#ly_change_site_popup')?.remove()
    }
}
export function showExportBox(item) {
    console.log('showExportBox',item)
    if (item) {
        if (document.querySelector('#ly_export_data_popup')) {//防止重复创建
            return
        }
        mountDOM(exportDataTemplate, 'body', '#ly_export_data_popup', (id) => {
            const eventFunctions = {
                ly_delay_export() {
                    // console.log('延迟导出')
                    document.querySelector('#ly_export_data_popup')?.remove()
                },
                ly_now_export() {
                    // console.log('立即导出')
                    document.querySelector('#ly_export_data_popup')?.remove()
                    const Connection = new Connect('export')
                    Connection.actions.export()
                    Connection.watchMessage((msg: { action: string, data: any }) => {
                        const { action, data } = msg
                        if (action === 'export') {
                            // console.log("后台worker export响应", data);
                            exportToExcel(data)
                        }
                    });
                },
            }
            eventFunctions[id] && eventFunctions[id]()
        })
    } else {
        document.querySelector('#ly_export_data_popup')?.remove()
    }
}
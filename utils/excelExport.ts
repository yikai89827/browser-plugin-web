import { browser } from 'wxt/browser';
import { utils, writeFile, write } from 'xlsx';
import { exportFields } from '../config/base'
import { formatDate } from '../utils/index'
// 自适应表格列宽
const calculateColumnWidth = (data: any[], headers: any) => {
    return headers.map((header: any, colIndex: string | number) => {
        // 计算标题宽度（中文字符按2单位计算）
        const headerWidth = [...header].reduce((sum, char) =>
            sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);

        // 计算该列内容最大宽度
        const contentWidth = data.reduce((max, row) => {
            const value = row[headers[colIndex]] || '';
            const cellWidth = [...String(value)].reduce((sum, char) =>
                sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
            return Math.max(max, cellWidth);
        }, 0);

        // 取标题和内容宽度的最大值，并增加2单位作为边距
        return { width: Math.max(headerWidth, contentWidth) + 2 };
    });
}
//处理excel头
const dataConverter = (data: any[], header: any) => {
    if (header) {
        return data.map(v => {
            return Object.entries(v).reduce((obj, item) => {
                if (header[item[0]]) {
                    // @ts-ignore
                    obj[header[item[0]]] = item[1]
                } else {
                    // @ts-ignore
                    obj[item[0]] = item[1]
                }
                return obj
            }, {})
        })
    } else {
        return data
    }
}
//处理excel
const initXlsx = (data: any[]) => {
    const { book_new, json_to_sheet, book_append_sheet } = utils
    const workbook = book_new();// 创建工作薄
    const worksheet = json_to_sheet(data);// json转为表格数据
    const headers = Object.keys(data[0] || {});// 获取表头
    worksheet['!cols'] = calculateColumnWidth(data, headers);// 设置自适应列宽
    book_append_sheet(workbook, worksheet, "优惠券");//将数据添加到excel表格中
    return workbook
}

// 前台程序导出excel
export const exportToExcel = (data: any[]) => {
    try {
        const list = dataConverter(data, exportFields);
        const workbook = initXlsx(list);

        // 使用流式写入替代全内存操作
        const writer = writeFile(workbook, `亚马逊优惠券汇总(${formatDate(new Date)}).xlsx`, {
            compression: true,// 启用压缩减少内存占用
            type: 'array' // 流式写入减少内存占用
        });

        // 释放内存
        workbook.SheetNames.forEach(name => {
            delete workbook.Sheets[name];
        });

        return writer;
    } catch (error) {
        console.error('导出失败', error);
        // throw error;
    }
}
// 转换为CSV格式
const convertToCSV = (data: any[], headers: Record<string, string>): string => {
    // 添加BOM头解决中文乱码
    let csv = '\uFEFF';

    // 添加标题行
    csv += Object.values(headers).join(',') + '\n';

    // 添加数据行
    data.forEach(item => {
        csv += Object.keys(headers).map(key => {
            let cell = item[key] ?? '';
            // 处理特殊字符
            if (typeof cell === 'string') {
                cell = cell.replace(/"/g, '""');
                if (cell.includes(',')) {
                    cell = `"${cell}"`;
                }
            }
            return cell;
        }).join(',') + '\n';
    });

    return csv;
};
//后台程序导出csv
export const exportToCsv = async (data: any[]) => {
    try {
        const list = dataConverter(data, exportFields);
        const csvContent = convertToCSV(list, exportFields);

        // 创建CSV Blob
        const blob = new Blob([csvContent], {
            type: 'text/csv;charset=utf-8'
        });
        // 生成下载链接
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });

        // 执行下载
        await browser.downloads.download({
            url: dataUrl,
            filename: `亚马逊优惠券汇总(${formatDate(new Date)}).csv`,  // 改为csv扩展名
            conflictAction: 'uniquify',
            saveAs: true
        });
        // // 创建隐藏的下载链接
        // const link = document.createElement('a');
        // link.href = URL.createObjectURL(blob);
        // link.download = '亚马逊优惠券汇总.csv';
        // link.style.display = 'none';

        // // 添加超时释放资源
        // setTimeout(() => {
        //     URL.revokeObjectURL(link.href);
        //     link.remove();
        // }, 30000);

        // // 混合方案：优先使用DOM下载，备选API方案
        // try {
        //     document.body.appendChild(link);
        //     link.click();
        //     await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
        // } catch (domError) {
        //     console.warn('DOM下载失败，尝试浏览器API:', domError);
        //     await browser.downloads.download({
        //         url: link.href,
        //         filename: link.download,
        //         conflictAction: 'uniquify'
        //     });
        // }

    } catch (error) {
        console.error('导出失败:', error);
        // throw error;
    }
}
// 后台程序导出
export const exportList = async (data: any[]) => {
    try {
        const list = dataConverter(data, exportFields)
        const workbook = initXlsx(list)
        const fileList = write(workbook, { type: 'array' })
        const blob = new Blob([fileList], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        })
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
        })

        try {
            await browser.downloads.download({
                url: dataUrl,
                filename: `亚马逊优惠券汇总(${formatDate(new Date)}).xlsx`,
                conflictAction: 'uniquify',
                saveAs: true
            });
        } catch (error) {
            console.error('下载失败:', error);
            throw error;
        }
        //紫鸟闪退
        // const objectURL = URL.createObjectURL(blob);
        // try {
        //     await browser.downloads.download({
        //         url: objectURL,
        //         filename: '亚马逊优惠券汇总.xlsx',
        //         conflictAction: 'uniquify',
        //         saveAs: true // 弹出保存对话框
        //     });
        // } catch (error) {
        //     console.error('下载失败:', error);
        //     throw error; // 抛出错误以便上层捕获
        // } finally {
        //     // 延迟释放ObjectURL确保下载完成
        //     setTimeout(() => URL.revokeObjectURL(objectURL), 10000);
        // }
    } catch (error) {
        console.error('导出失败', error)
    }
}
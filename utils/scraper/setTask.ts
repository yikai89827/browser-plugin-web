import { formatDate } from '..';
import { browserStorage } from '../storage';
import { convertCacheData, getCountryInfo } from '../storage/dataConverter';

// 动态导入fetchData模块，避免构建时问题
async function getFetchDataFunctions() {
  return await import('./fetchData');
}

//处理同步任务时间信息
const setTaskTimeInfo = async (temp: { first: any, last: any }, countryId: string) => {
    const nowTime = formatDate(new Date(Date.now()))
    if (countryId) {
        temp.first = temp.first || {}
        if (!temp.first[countryId]) {
            temp.first[countryId] = nowTime
        }
        temp.last = temp.last || {}
        temp.last[countryId] = nowTime
    }
    return temp
}
//处理同步任务信息
const setSyncTaskInfo = async () => {
    try {
        const syncTaskInfo = await browserStorage.get('lySyncTaskInfo')
        if (!syncTaskInfo) {
            await browserStorage.set('lySyncTaskInfo', JSON.stringify({
                isRunning: false,
                startTime: null,
                endTime: null
            }))
        }
    } catch (error) {
        console.error('setSyncTaskInfo error', error)
    }
}
//获取任务列表
export const initTaskList = async () => {
    const fetchData = await getFetchDataFunctions();
    const { getMerchantMarketplace, getMerchantInfo, getConfig } = fetchData;
    
    try {
        console.log('initTaskList')
        await setSyncTaskInfo()
        const res2: any = await getMerchantInfo()
        const taskList: any[] = []
        const marketplaceList = res2?.merchantMarketplaces || []
        console.log('marketplaceList', marketplaceList)
        if (marketplaceList?.length) {
            marketplaceList.forEach((item: any, index: number) => {
                taskList.push({
                    id: item.id,
                    country: item.country,
                    countryId: item.countryId,
                    marketplaceId: item.marketplaceId,
                    currency: item.currency,
                    name: item.name,
                    index
                })
            })
        }
        return taskList
    } catch (error) {
        console.error('initTaskList error', error)
        return []
    }
}
//执行任务列表
export const startTaskList = async (taskList: any[]) => {
    const fetchData = await getFetchDataFunctions();
    const { fetchCouponData, changeSite, getLanguages, initRequest } = fetchData;
    
    try {
        console.log('startTaskList', taskList)
        const syncTaskInfo = await browserStorage.get('lySyncTaskInfo')
        if (syncTaskInfo) {
            const temp = JSON.parse(syncTaskInfo)
            temp.isRunning = true
            temp.startTime = formatDate(new Date())
            await browserStorage.set('lySyncTaskInfo', JSON.stringify(temp))
        }
        for (let i = 0; i < taskList.length; i++) {
            const item = taskList[i]
            console.log(`开始执行第${i + 1}个任务`, item)
            const syncTaskInfo = await browserStorage.get('lySyncTaskInfo')
            if (syncTaskInfo && JSON.parse(syncTaskInfo)?.isRunning) {
                const queryString = `?mons_sel_dir_mcid=${item.id}&mons_sel_mkid=${item.marketplaceId}&mons_sel_dir_paid=${item.id}&timestamp=${Date.now()}`
                await changeSite(item.baseURL, queryString)
                await initRequest(item.baseURL)
                await fetchCouponData(0, i === taskList.length - 1)
            } else {
                console.log('任务已停止')
                break
            }
        }
    } catch (error) {
        console.error('startTaskList error', error)
    }
}
//执行下一个任务
export const goNextTask = async () => {
    const fetchData = await getFetchDataFunctions();
    const { changeSite, initRequest, fetchCouponData } = fetchData;
    
    try {
        console.log('goNextTask')
        const syncTaskInfo = await browserStorage.get('lySyncTaskInfo')
        if (!syncTaskInfo) return
        const taskList = await browserStorage.get('lyTaskList')
        if (!taskList) return
        const { currentIndex = 0 } = JSON.parse(syncTaskInfo)
        const list = JSON.parse(taskList)
        if (currentIndex < list.length) {
            const item = list[currentIndex]
            console.log(`继续执行第${currentIndex + 1}个任务`, item)
            const queryString = `?mons_sel_dir_mcid=${item.id}&mons_sel_mkid=${item.marketplaceId}&mons_sel_dir_paid=${item.id}&timestamp=${Date.now()}`
            await changeSite(item.baseURL, queryString)
            await initRequest(item.baseURL)
            await fetchCouponData(0, currentIndex === list.length - 1)
        } else {
            console.log('所有任务已完成')
        }
    } catch (error) {
        console.error('goNextTask error', error)
    }
}

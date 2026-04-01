import { formatDate } from '..';
import { browserStorage } from '../storage';
import { convertCacheData, getCountryInfo } from '../storage/dataConverter';
import { changeSite, fetchCouponData, getConfig, getLanguages, getMerchantInfo, getMerchantMarketplace, initRequest } from './fetchData';
// import { v4 as uuid } from 'uuid';
// import mockData from '../../config/data.json';
// import { formatDate, randomIntInRange } from '../index'
// import { fetchCouponData } from './fetchData';
// import { DB } from '../../utils/storage/DB'
// const failedTime: string = await browserStorage.get('lyFailedTime') || '{}';
// const { time, sleepTime } = JSON.parse(failedTime)
// import { HttpClient } from '../connect/fetch'

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
        if (syncTaskInfo) {
            const temp = JSON.parse(syncTaskInfo)
            temp.isRunning = true
            const { index, taskList } = temp
            temp.index = index === null ? 0 : index + 1
            const marketplaceId = taskList[index]?.mons_sel_mkid
            const { countryId } = await getCountryInfo(marketplaceId)
            const newInfo = await setTaskTimeInfo(temp, countryId)
            await browserStorage.set('lySyncTaskInfo', JSON.stringify(newInfo))
        }
    } catch (error) {
        console.log('处理同步任务信息出错', error)
    }
}
//初始化同步任务信息
const initSyncTaskInfo = async (taskList: any[]) => {
    if (taskList?.length) {
        const syncTaskInfo = await browserStorage.get('lySyncTaskInfo')
        if (syncTaskInfo){
            const temp = JSON.parse(syncTaskInfo)
            temp.isRunning = false
            temp.index = null
            temp.taskList = taskList
            temp.taskTotal = taskList.length
            await browserStorage.set('lySyncTaskInfo', JSON.stringify(temp))
        }else {
            const temp = { index: null, isRunning: false, taskList, taskTotal: taskList.length }
            await browserStorage.set('lySyncTaskInfo', JSON.stringify(temp))
        }
    }
}
//获取国家列表
export const initTaskList = async () => {
    try {
        const url = await browserStorage.get('lyLocationOrigin')
        await initRequest(url)
        const { regionalAccounts }: any = await getMerchantMarketplace()
        const taskList = regionalAccounts?.slice()?.sort((a, b) => {//当前选择的国家排第一
            if (a.selected && !b.selected) return -1;
            if (!a.selected && b.selected) return 1;
            return 0;
        })?.map(v => {
            const { ids, globalAccountId, selected } = v
            if (ids && globalAccountId) {
                const { mons_sel_dir_mcid, mons_sel_mkid } = ids
                return {
                    mons_sel_dir_mcid,//店铺id
                    mons_sel_mkid,//站点id
                    mons_sel_dir_paid: globalAccountId,//账户id
                    selected,//当前选择的国家
                }
            }
            return {}
        })
        console.log('getMerchantMarketplace 获取任务列表结果', taskList)
        await initSyncTaskInfo(taskList)
        return taskList
    } catch (error) {
        return []
    }
}
//任务执行
export const startTaskList = async (taskList: any[], isLast?: boolean) => {
    try {
        if (!taskList?.length) {
            throw new Error('任务队列生成失败');
        }
        const { currency, marketplaceId }: any = await getConfig()
        console.log('getConfig 获取货币类型和国家站点id结果', currency, marketplaceId)
        await setSyncTaskInfo()
        const res1 = await getMerchantInfo()
        console.log('getMerchantInfo 获取店铺信息结果', res1)
        const res2 = await fetchCouponData(0, isLast)
        console.log('fetchCouponData 获取优惠券结果', res2)
    } catch (error) {
        console.log(error)
    }
}
//执行下一个任务
export const goNextTask = async () => {
    try {
        const baseURL = await browserStorage.get('lyLocationOrigin')
        const syncTaskInfo = await browserStorage.get('lySyncTaskInfo')
        if (syncTaskInfo) {
            const temp = JSON.parse(syncTaskInfo)
            const { index, taskList } = temp
            temp.isRunning = true
            temp.index = index + 1
            console.log('goNextTask taskList, index', taskList, temp.index, temp.index === taskList?.length - 1)
            if (taskList[index]) {
                const { mons_sel_dir_mcid, mons_sel_mkid, mons_sel_dir_paid } = taskList[index]
                if (mons_sel_dir_mcid && mons_sel_mkid && mons_sel_dir_paid) {
                    const urlString = `?mons_sel_dir_mcid=${mons_sel_dir_mcid}&mons_sel_mkid=${mons_sel_mkid}&mons_sel_dir_paid=${mons_sel_dir_paid}&timestamp=${Date.now()}`
                    await changeSite(baseURL, urlString)
                    await startTaskList(taskList, temp.index === taskList?.length - 1)
                } else {
                    throw new Error('任务生成失败');
                }
            }else {
                throw new Error('任务生成失败');
            }
        }
    } catch (error) {
        console.log(error)
    }
}


//切换站点流程
// https://sellercentral.amazon.de/home?mons_sel_dir_mcid=amzn1.merchant.d.AD77BVCTEVXJRW2ODZEVP6BSECZQ&mons_sel_mkid=A1PA6795UKMFR9&mons_sel_dir_paid=amzn1.pa.d.AAZ3IHCLL7CMO7K7Z5T4GMKX4YVQ&timestamp=1748243232947

//切换语言
// https://sellercentral.amazon.de/language-switcher/change-language?ref_=xx_swlang_head_xx&formSubmitted=true&language=en_DE&location=https://sellercentral.amazon.de/home?timestamp=1748243235541

//设置语言
// https://sellercentral.amazon.de/home?timestamp=1748243235541&languageSwitched=1&mons_sel_locale=en_DE


//店铺信息
// https://sellercentral.amazon.de/partner-dropdown/data/get-partner-accounts?stck=na
// { "delegationContext": "" }

//可选店铺国家列表
// https://sellercentral.amazon.de/partner-dropdown/data/get-merchant-marketplaces-for-partner-account
// {"delegationContext":"","partnerAccountId":"amzn1.pa.o.A2RNHJJB3R30DQ"}


//菜单列表
// https://sellercentral.amazon.de/trim/global-nav?whereTag=dnav&documentName=sellerCentral

// 获取语言列表
// https://sellercentral.amazon.de/trim/get-available-locales

//验证码页面代码加载
// https://sellercentral.amazon.de/ap/signin?clientContext=258-8355742-6203437&openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fsellercentral.amazon.de%2Fcoupons%2Fref%3Dxx_scoupn_dnav_xx%3Fref_%3Dxx_swlang_head_xx%26mons_sel_locale%3Dzh_CN%26languageSwitched%3D1&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=sc_de_amazon_v2&openid.mode=checkid_setup&language=zh_CN&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&pageId=sc_amazon_v3_unified&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0

// //封装带延迟的请求函数（支持重试）
// const fetchWithRetry = async (url, prevData, delay = 1000, retries = 3)=> {
//     try {
//         const http = new HttpClient({ baseURL })
//         const res: any = await http.get(url)
//         return await res;
//     } catch (error) {
//         if (retries <= 0) throw error; // 达到最大重试次数仍失败
//         console.log(`接口 ${url} 失败，${delay}ms后重试，剩余次数: ${retries}`);
//         await new Promise(resolve => setTimeout(resolve, delay)); // 延迟
//         return fetchWithRetry(url, prevData, delay * 2, retries - 1); // 指数退避重试
//     }
// }

// // 按顺序执行多个依赖接口
// async function sequentialRequests() {
//     const urls = ['/api1', '/api2', '/api3', '/api4', '/api5'];
//     let previousResult = null;

//     for (const url of urls) {
//         try {
//             previousResult = await fetchWithRetry(url, 3, 1000, previousResult);
//             console.log(`${url} 成功:`, previousResult);
//         } catch (error) {
//             console.log(`${url} 最终失败:`, error.message);
//             break; // 任意接口彻底失败则终止流程
//         }
//     }
// }

// 执行示例
// sequentialRequests();

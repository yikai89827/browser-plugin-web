import { v4 as uuid } from 'uuid';
import { HttpClient, http } from '../connect/fetch'
import { browserStorage } from '../storage';
import { convertCacheData, getCountryInfo } from '../storage/dataConverter';
import { Connection } from '../connect/background';
import { DB } from '../storage/DB';
import { formatDate } from '..';
import { goNextTask } from './setTask';
// import { DB } from '../../utils/storage/DB'


//设置请求头
const setHeader = (headers, token) => {
    try {
        if (headers && token) {
            const data = JSON.parse(headers)
            data.push(['Anti-Csrftoken-A2z', token])
            const header = data?.reduce((obj, item) => {
                obj[item[0]] = item[1]
                return obj
            }, {})
            return header
        }
        return headers
    } catch (error) {
        return headers
    }
}
//获取请求公共信息
const getRequestBaseInfo = async () => {
    // @ts-ignore
    const apiUrl = import.meta?.env?.WXT_COUPON_API_URL || '/coupons/api/getCouponPromotions'
    const headers = await browserStorage.get('lyRequestHeaders')
    const baseURL = await browserStorage.get('lyLocationOrigin')
    // console.log('%c baseURL2', 'font-size:24px;color:#000;', baseURL)
    // const baseURL = 'https://sellercentral.amazon.de/'//调试
    const token = await browserStorage.get('lyResponseHeadersToken')
    const header = setHeader(headers, token)

    console.log('%c baseURL', 'color:#000;', baseURL)
    return {
        apiUrl,
        header,
        baseURL,
    }
}
//初始化页面信息请求/获取token
export const initRequest = async (baseURL: string) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('initRequest')
            const http = new HttpClient({ baseURL })
            const res: any = await http.get('/home?timestamp=' + Date.now())
            resolve(res)
        } catch (error) {
            reject(error)
        }
    })
}
//获取当前店铺可选国家列表和账户id
export const getMerchantMarketplace = async () => {
    // https://sellercentral.amazon.de/account-switcher/global-and-regional-account/merchantMarketplace?
    // https://sellercentral.amazon.de/account-switcher/regional-accounts/merchantMarketplace?globalAccountId=amzn1.pa.d.AAZ3IHCLL7CMO7K7Z5T4GMKX4YVQ
    return new Promise(async (resolve, reject) => {
        // const accoutId = 'amzn1.pa.d.AAZ3IHCLL7CMO7K7Z5T4GMKX4YVQ'
        try {
            const { header, baseURL } = await getRequestBaseInfo()
            if (header && baseURL) {
                console.log('getMerchantMarketplace')
                const http = new HttpClient({ baseURL, header })
                const res1: any = await http.get(`/account-switcher/global-and-regional-account/merchantMarketplace?`)
                console.log('getMerchantMarketplace 请求结果1', res1, res1?.globalAccount?.id)
                const res2: any = await http.get(`/account-switcher/regional-accounts/merchantMarketplace?globalAccountId=${res1?.globalAccount?.id}`)
                console.log('getMerchantMarketplace 请求结果2', res2)
                resolve(res2)
            }
        } catch (error) {
            reject(error)
        }
    })
}
// 获取当前货币等配置
export const getConfig = async () => {
    return new Promise(async (resolve, reject) => {
        try {
            const { header, baseURL } = await getRequestBaseInfo()
            if (header && baseURL) {
                console.log('getConfig')
                const http = new HttpClient({ baseURL, header })
                const res: any = await http.get('/coupons/api/config')
                console.log('getConfig 请求结果', res)
                resolve(res)
                if (res?.currency) {
                    browserStorage.set('lyCouponsCurrency', res?.currency)//货币
                    // browserStorage.set('lyMarketplaceId', res?.marketplaceId)//国家id
                }
            }
        } catch (error) {
            reject(error)
        }
    })
}
//获取店铺账户id
export const getGlobalAccounts = async () => {
    return new Promise(async (resolve, reject) => {
        try {
            const { header, baseURL } = await getRequestBaseInfo()
            if (header && baseURL) {
                console.log('getGlobalAccounts')
                const http = new HttpClient({ baseURL, header })
                const res: any = await http.get('/account-switcher/global-accounts?timestamp=' + Date.now())
                console.log('getGlobalAccounts 请求结果', res)
                resolve(res)
            }
        } catch (error) {
            reject(error)
        }
    })
}
//获取店铺国家站点id
export const getMerchantInfo = async () => {
    // getAccounts(host + '/partner-dropdown/data/get-partner-accounts?stck=na', {
    //     delegationContext: ""
    // })
    return new Promise(async (resolve, reject) => {
        try {
            const { header, baseURL } = await getRequestBaseInfo()
            console.log('getMerchantInfo')
            if (header && baseURL) {
                const http = new HttpClient({ baseURL, header })
                const res: any = await http.get('/coupons/api/merchantInfo')
                console.log('getMerchantInfo 请求结果', res)
                resolve(res)
            }
        } catch (error) {
            reject(error)
        }
    })
}
//切换国家
export const changeSite = async (baseURL: string, queryString: any) => {
    return new Promise(async (resolve, reject) => {
        // https://sellercentral.amazon.de/home?mons_sel_dir_mcid=amzn1.merchant.d.AD77BVCTEVXJRW2ODZEVP6BSECZQ&mons_sel_mkid=A1PA6795UKMFR9&mons_sel_dir_paid=amzn1.pa.d.AAZ3IHCLL7CMO7K7Z5T4GMKX4YVQ&timestamp=1748243232947
        try {
            console.log('changeSite')
            const http = new HttpClient({ baseURL })
            const res: any = await http.get('/home' + queryString)
            console.log('changeSite 请求结果')
            resolve(res)
        } catch (error) {
            reject(error)
        }
    })
}
//获取语言列表
export const getLanguages = async () => {
    return new Promise(async (resolve, reject) => {
        try {
            const { header, baseURL } = await getRequestBaseInfo()
            if (header && baseURL) {
                console.log('getLanguages')
                const http = new HttpClient({ baseURL, header })
                const res: any = await http.get('/trim/get-available-locales')
                console.log('getLanguages 请求结果', res)
                resolve(res)
            }
        } catch (error) {
            reject(error)
        }
    })
}
//切换语言
export const changeLanguage = async (item: string) => {
    //切换语言
    // https://sellercentral.amazon.de/language-switcher/change-language?ref_=xx_swlang_head_xx&formSubmitted=true&language=en_DE&location=https://sellercentral.amazon.de/home?timestamp=1748243235541

    //设置语言
    // https://sellercentral.amazon.de/home?timestamp=1748243235541&languageSwitched=1&mons_sel_locale=en_DE
    return new Promise(async (resolve, reject) => {
        try {
            const { header, baseURL } = await getRequestBaseInfo()
            if (header && baseURL) {
                const http = new HttpClient({ baseURL, header })
                const res: any = await http.get(`/home?timestamp=${Date.now()}&languageSwitched=1&mons_sel_locale=${item}`)
                console.log('changeLanguage 请求结果')
                resolve(res)
            }
        } catch (error) {
            reject(error)
        }
    })
}
//下一个任务控制
const nextTaskCtrl = async (isLast?: boolean)=>{
    if (isLast) {
        const syncTaskInfo = await browserStorage.get('lySyncTaskInfo')
        if (syncTaskInfo) {
            const temp = JSON.parse(syncTaskInfo)
            temp.isRunning = false
            await browserStorage.set('lySyncTaskInfo', JSON.stringify(temp))
        }

        console.log('全部获取完成')
        Connection.broadcastToContent({ action: 'showExportBox', data: "提醒导出" })
    } else {
        console.log('当前国家数据获取完成')
        const notShowDate = await browserStorage.get('notShowchangeSiteBoxDate') || ''
        if (!notShowDate || (notShowDate && formatDate(notShowDate) !== formatDate(new Date))) {//用户没有设置当天不提醒
            try {
                Connection.broadcastToContent({ action: 'showNotifyBox', data: "提醒切换站点" })
            } catch (error) {
                console.log(error)
                goNextTask()//执行下一个任务
            }
        } else {
            goNextTask()//执行下一个任务
        }
        // let timer = setTimeout(() => {
        //     goNextTask()//执行下一个任务
        //     // @ts-ignore
        // }, import.meta?.env?.WXT_MODAL_TIMEOUT || 15000)
        // Connection.watchMessage((msg: { action: string, data: any }) => {
        //     console.log("fetchCouponData收到后台worker消息", msg);
        //     if (msg?.action === 'pageCtrlTaskStatus') {
        //         clearTimeout(timer)
        //     }
        // });
    }
}
//获取优惠券数据
export const fetchCouponData = async (paginationSkip: number = 0, isLast?: boolean) => {
    return new Promise(async (resolve, reject) => {
        try {
            const { apiUrl, header, baseURL } = await getRequestBaseInfo()
            // @ts-ignore
            const paginationSize = import.meta?.env?.WXT_PAGE_SIZE || 25
            let result
            if (header && baseURL) {
                const url = apiUrl + `?paginationSize=${paginationSize}&paginationSkip=${paginationSkip * paginationSize}`
                console.log('fetchCouponData', baseURL, apiUrl)
                const http = new HttpClient({ baseURL, header })
                const { promotionSearchResultList, promotionTotalCount }: { promotionSearchResultList: any[], promotionTotalCount: number } = await http.get(url)
                console.log('fetchCouponData 请求结果', apiUrl, promotionSearchResultList, promotionTotalCount)
                if (promotionSearchResultList?.length) {
                    const marketplaceId = promotionSearchResultList[0]?.marketplaceId
                    const { country, countryId } = await getCountryInfo(marketplaceId)
                    result = await convertCacheData(promotionSearchResultList, {
                        page: paginationSkip,
                        rows: paginationSize,
                        last: promotionSearchResultList?.length
                    })
                    console.log('fetchCouponData 转换为缓存结构后的结果', result)
                    if (result?.length) {
                        const db = await DB()
                        const item = {
                            id: countryId + '_' + (paginationSkip + 1),
                            country,
                            lastSyncTime: formatDate(new Date),
                            page: paginationSkip,
                            rows: paginationSize,
                            total: promotionTotalCount || 0,
                            list: result
                        }
                        db.put(item);
                    }
                }
                if (promotionTotalCount > paginationSize * (paginationSkip + 1)) {
                    resolve(promotionSearchResultList?.length ? result : [])
                    fetchCouponData(paginationSkip + 1, isLast)
                } else {
                    console.log('获取完成... 即将切换站点', isLast)
                    resolve(promotionSearchResultList?.length ? result : [])
                    await nextTaskCtrl(isLast)
                }

            }
        } catch (error) {
            reject(error)
        }
    })
}

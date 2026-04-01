import { formatDate } from '../index';
import { SourceItem, TargetItem } from '../../interfaces/dataConverter'
import { discountTypes, siteArray, couponStatus, codeToSiteMap } from '../../config/base'
import { browserStorage } from '../storage';
// import { getConfig } from '../scraper/fetchData';
// import { v4 as uuid } from 'uuid';

//兑换比率计算
const calculateRedemptionRate = (redemptionCount: number, clipCount: number): string => {
    if (!clipCount) return '0.00%';
    return `${((redemptionCount / clipCount) * 100).toFixed(2)}%`;
}
//折扣值处理
const calculateDiscount = (discountType: string, discountValue: number): string => {
    return discountTypes[discountType][1] ? discountTypes[discountType][0] + (discountValue || 0) : (discountValue || 0) + discountTypes[discountType][0]
}
//获取国家名称
export const getCountryInfo = async (code) => {
    if (code) {
        const countryId: string = code.split('.')?.length > 3 ? code.split('.')[3] : code
        const countryCode = codeToSiteMap[countryId]
        const countryInfo: string[] = siteArray.find(v => countryCode === v[0]) || []
        return {
            country: countryInfo[2],
            countryId: countryCode
        }
    }
    return {
        country: '',
        countryId: ''
    }
}
//转换每条数据方法
const convertCacheItem = async (item: any, index: number, pageInfo: { page: number, rows: number, last: number }) => {
    const { obfuscatedPromotionId, customerId, marketplaceId, discountType, discountValue, startDate, endDate, saleCount, title, budget, status } = item
    const { budgetSpent, clipCount, redemptionCount, sales } = item.couponMetrics || {}
    const { page, rows } = pageInfo
    const { country, countryId } = await getCountryInfo(marketplaceId)
    discountTypes['MONEY'][0] = await browserStorage.get('lyCouponsCurrency') || ''
    const syncTaskInfo = await browserStorage.get('lySyncTaskInfo') || "{}"
    const newInfo = JSON.parse(syncTaskInfo)
    const firstSyncTime = newInfo?.first && newInfo?.first[countryId] ? newInfo?.first[countryId] : ''
    const lastSyncTime = newInfo?.last && newInfo?.last[countryId] ? newInfo?.last[countryId] : ''
    const activeTime = startDate && endDate ? `${formatDate(new Date(startDate))} ~ ${formatDate(new Date(endDate))}` : ''
    const statusObj: { key: string, value: string } = couponStatus.find(v => v.key === status) || { key: '', value: '未知' }
    const store = customerId
    return {
        id: obfuscatedPromotionId,
        parentId: countryId ? `${countryId}_${page + 1}` : '',
        orderId: `${index + 1 + page * rows}`,
        title,
        country,
        store,
        status: statusObj?.value || '',
        discount: calculateDiscount(discountType, discountValue),
        budget: discountTypes['MONEY'][0] + (budget || 0),
        budgetSpent: discountTypes['MONEY'][0] + (budgetSpent || 0),
        clipCount: clipCount || 0,
        redemptionCount: redemptionCount || 0,
        redemptionRate: calculateRedemptionRate(redemptionCount, clipCount),
        sales: discountTypes['MONEY'][0] + (sales || 0),
        saleCount: saleCount || 0,
        activeTime,
        firstSyncTime,
        lastSyncTime,
        remark: '',
    }
}
//亚马逊接口数据转换为缓存数据结构
export const convertCacheData = async (source: SourceItem[], pageInfo: { page: number, rows: number, last: number }): Promise<TargetItem[]> => {
    return Promise.all(source.map((item, index) => convertCacheItem(item, index, pageInfo)))
}
// //获取站点信息
// export const getSiteInfo = async (code) => {
//     const countryId: string = code ? code.split('.')[3] : ''
//     const countryCode = codeToSiteMap[countryId]
//     const countryInfo: string[] = siteArray.find(v => countryCode === v[0]) || []
//     return {
//         country: countryInfo[2],
//         countryId
//     }
// }
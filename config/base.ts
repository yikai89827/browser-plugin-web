//亚马逊各个国家站点地址
export const siteArray: any[] = [
    //美洲地区
    ["US", "https://www.amazon.com", "美国", "https://sellercentral.amazon.com"],
    ["CA", "https://www.amazon.ca", "加拿大", "https://sellercentral.amazon.ca"],
    ["MX", "https://www.amazon.com.mx", "墨西哥", "https://sellercentral.amazon.com.mx"],
    ["BR", "https://www.amazon.com.br", "巴西", "https://sellercentral.amazon.com.br"],
    //欧洲地区
    ["UK", "https://www.amazon.co.uk", "英国", "https://sellercentral.amazon.co.uk"],
    ["DE", "https://www.amazon.de", "德国", "https://sellercentral.amazon.de"],
    ["ES", "https://www.amazon.es", "西班牙", "https://sellercentral.amazon.es"],
    ["IT", "https://www.amazon.it", "意大利", "https://sellercentral.amazon.it"],
    ["FR", "https://www.amazon.fr", "法国", "https://sellercentral.amazon.fr"],
    ["NL", "https://www.amazon.nl", "荷兰", "https://sellercentral.amazon.nl"],
    ["SE", "https://www.amazon.se", "瑞典", "https://sellercentral.amazon.se"],
    ["IN", "https://www.amazon.in", "印度", "https://sellercentral.amazon.in"],
    ["AE", "https://www.amazon.ae", "阿联酋", "https://sellercentral.amazon.ae"],
    ["SA", "https://www.amazon.sa", "沙特阿拉伯", "https://sellercentral.amazon.sa"],
    ["PL", "https://www.amazon.pl", "波兰", "https://sellercentral.amazon.pl"],
    ["TR", "https://www.amazon.com.tr", "土耳其", "https://sellercentral.amazon.com.tr"],
    ["BE", "https://www.amazon.com.be", "比利时", "https://sellercentral.amazon.com.be"],
    ["IE", "https://www.amazon.ie", "爱尔兰", "https://sellercentral.amazon.ie"],
    ["EG", "https://www.amazon.eg", "埃及", "https://sellercentral.amazon.eg"],
    //远东地区
    ["SG", "https://www.amazon.sg", "新加坡", "https://sellercentral.amazon.sg"],
    ["JP", "https://www.amazon.co.jp", "日本", "https://sellercentral.amazon.co.jp"],
    ["AU", "https://www.amazon.com.au", "澳大利亚", "https://sellercentral.amazon.com.au"]
]
//各国家站点id
export const MarketplaceObj = {
    BR: 'A2Q3Y263D00KWC',
    CA: 'A2EUQ1WTGCTBG2',
    MX: 'A1AM78C64UM0Y8',
    US: 'ATVPDKIKX0DER',
    AE: 'A2VIGQ35RCS4UG',
    DE: 'A1PA6795UKMFR9',
    EG: 'ARBP9OOSHTCHU',
    ES: 'A1RKKUPIHCS9HS',
    FR: 'A13V1IB3VIYZZH',
    UK: 'A1F83G8C2ARO7P',
    GB: 'A1F83G8C2ARO7P',
    IN: 'A21TJRUUN4KGV',
    IT: 'APJ6JRA9NG5V4',
    NL: 'A1805IZSGTT6HS',
    SA: 'A17E79C6D8DWNP',
    TR: 'A33AVAJ2PDY3EV',
    SG: 'A19VAU5U5O7RUS',
    AU: 'A39IBJ37TRP1C6',
    JP: 'A1VC38T7YXB528',
    SE: 'A2NODRKZP88ZB9',
    PL: 'A1C3SOZRARQ6R3',
    BE: 'AMEN7PMS3EDWL',
    IE: 'A28R8C7NBKEWEA'
}
//通过id查询国家地址尾缀
// https://sellercentral.amazon.de/coupons/api/merchantInfo   返回的marketplaceId字段最后一截就是国家id
// https://sellercentral.amazon.de/account-switcher/global-and-regional-account/merchantMarketplace?
// 获取店铺信息  结构如下
// const regionalAccounts = {
//     globalAccountId: "amzn1.pa.d.AAZ3IHCLL7CMO7K7Z5T4GMKX4YVQ",//店铺id
//     ids: {
//         mons_sel_dir_mcid: "amzn1.merchant.d.AD77BVCTEVXJRW2ODZEVP6BSECZQ",
//         mons_sel_mkid: "amzn1.mp.o.A1F83G8C2ARO7P",
//     },
//     label: "英国",//国家名字
// }
export const codeToSiteMap = {
    A2Q3Y263D00KWC: 'BR',
    A2EUQ1WTGCTBG2: 'CA',
    A1AM78C64UM0Y8: 'MX',
    ATVPDKIKX0DER: 'US',
    A2VIGQ35RCS4UG: 'AE',
    A1PA6795UKMFR9: 'DE',
    ARBP9OOSHTCHU: 'EG',
    A1RKKUPIHCS9HS: 'ES',
    A13V1IB3VIYZZH: 'FR',
    A1F83G8C2ARO7P: 'UK',
    A21TJRUUN4KGV: 'IN',
    APJ6JRA9NG5V4: 'IT',
    A1805IZSGTT6HS: 'NL',
    A17E79C6D8DWNP: 'SA',
    A33AVAJ2PDY3EV: 'TR',
    A19VAU5U5O7RUS: 'SG',
    A39IBJ37TRP1C6: 'AU',
    A1VC38T7YXB528: 'JP',
    A2NODRKZP88ZB9: 'SE',
    A1C3SOZRARQ6R3: 'PL',
    AMEN7PMS3EDWL: 'BE',
    A28R8C7NBKEWEA: 'IE'
}
//通过国家地址尾缀查询国家code
export const codeToCountryId = {
    'US': 1,
    'CA': 2,
    'MX': 3,
    'UK': 4,
    'DE': 5,
    'FR': 6,
    'IT': 7,
    'ES': 8,
    'IN': 9,
    'JP': 10,
    'AU': 12,
    'AE': 13,
    'SG': 14,
    'NL': 15,
    'SA': 16,
    'BR': 17,
    'SE': 18,
    'PL': 19,
    'TR': 20,
    'BE': 21,
    'IE': 22,
    'EG': 23
}
//优惠券导出字段对照信息
export const exportFields = {
    orderId: '编号',
    couponId: '优惠券id',
    title: "优惠券名称",
    country: "国家",
    store: "店铺",
    status: "优惠券状态",
    discount: "折扣率",
    budget: "预算",
    budgetSpent: "支出",
    sales: "销售额",
    clipCount: "领取数",
    redemptionCount: "兑换数",
    redemptionRate: "兑换率",
    budgetUtilization: "预算单位",
    startDate: "活动开始时间",
    endDate: "活动结束时间",
    couponType: "劵类型",
    asinCount: "适用商品数",
    saleCount: "销量",
    activeTime: "活动时间",
    firstSyncTime: "首次同步时间",
    lastSyncTime: "最近同步时间",
    remark: "备注",
}
//优惠券接口字段对照信息
export const fields = {
    title: "优惠券名称",
    // country: "国家名称",
    marketplaceId: '国家站点id',
    // store: "店铺名称",
    customerId: '店铺id',
    status: "优惠券状态",
    discountType: "折扣类型",
    discountValue: "折扣值",
    budget: "预算",
    couponMetrics: {
        budgetSpent: "支出",
        sales: "销售额",
        clipCount: "领取数",
        redemptionCount: "兑换数",
        budgetUtilization: "预算单位"
    },
    startDate: "活动开始时间",
    endDate: "活动结束时间",
    couponType: "劵类型",
    asinCount: "适用商品数",
    saleCount: "销量",
    activeTime: "活动时间",
    firstSyncTime: "首次同步时间",
    lastSyncTime: "最近同步时间",
    remark: "备注",
}
//优惠券状态
export const couponStatus = [
    {
        key: 'RUNNING',
        value: '生效中'
    },
    {
        key: 'FAILED',
        value: '失败'
    },
    {
        key: 'CANCELLED',
        value: '已取消'
    },
    {
        key: 'EXPIRED',
        value: '已过期'
    },
]
//折扣类型
export const discountTypes = {
    "MONEY": ["", 1],
    "PERCENT": ["%", 0],
}
//支持的优惠券类型
export const allowedCouponTypes = {
    standard: '标准',
    subscribe_and_save: '订阅和保存'
}
// https://sellercentral.amazon.de/trim/get-available-locales 获取语言列表
export const locales = [
    {
        "code": "fr_FR",
        "nativeName": "Français",
        "countryName": "France"
    },
    {
        "code": "en_FR",
        "nativeName": "English",
        "countryName": "United Kingdom"
    },
    {
        "code": "zh_CN",
        "nativeName": "中文(简体)",
        "countryName": "中国大陆"
    },
    {
        "code": "de_DE",
        "nativeName": "Deutsch",
        "countryName": "Deutschland"
    },
    {
        "code": "es_ES",
        "nativeName": "Español",
        "countryName": "España"
    },
    {
        "code": "it_IT",
        "nativeName": "Italiano",
        "countryName": "Italia"
    },
    {
        "code": "ja_JP",
        "nativeName": "日本語",
        "countryName": "日本"
    },
    {
        "code": "ko_KR",
        "nativeName": "한국어",
        "countryName": "대한민국"
    },
    {
        "code": "zh_TW",
        "nativeName": "中文(繁體)",
        "countryName": "中國台灣"
    }
]
//欧洲地区
export const regionalAccounts1 = [
    {
        "ids": {
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAY3WP6674657FFA2JKBNQEWCCKA",
            "mons_sel_mkid": "amzn1.mp.o.A1805IZSGTT6HS"
        },
        "label": "荷兰",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.ADUILQ4FEWY2HTJ5JBVGG3MWESPQ",
        "domain": null,
        "selected": false
    },
    {
        "ids": {
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAY3WP6674657FFA2JKBNQEWCCKA",
            "mons_sel_mkid": "amzn1.mp.o.A13V1IB3VIYZZH"
        },
        "label": "法国",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.ADUILQ4FEWY2HTJ5JBVGG3MWESPQ",
        "domain": null,
        "selected": true
    },
    {
        "ids": {
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAY3WP6674657FFA2JKBNQEWCCKA",
            "mons_sel_mkid": "amzn1.mp.o.APJ6JRA9NG5V4"
        },
        "label": "意大利",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.ADUILQ4FEWY2HTJ5JBVGG3MWESPQ",
        "domain": null,
        "selected": false
    },
    {
        "ids": {
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAY3WP6674657FFA2JKBNQEWCCKA",
            "mons_sel_mkid": "amzn1.mp.o.A1F83G8C2ARO7P"
        },
        "label": "英国",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.ADUILQ4FEWY2HTJ5JBVGG3MWESPQ",
        "domain": null,
        "selected": false
    },
    {
        "ids": {
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAY3WP6674657FFA2JKBNQEWCCKA",
            "mons_sel_mkid": "amzn1.mp.o.A33AVAJ2PDY3EV"
        },
        "label": "土耳其",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.ADUILQ4FEWY2HTJ5JBVGG3MWESPQ",
        "domain": null,
        "selected": false
    },
    {
        "ids": {
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAY3WP6674657FFA2JKBNQEWCCKA",
            "mons_sel_mkid": "amzn1.mp.o.A1PA6795UKMFR9"
        },
        "label": "德国",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.ADUILQ4FEWY2HTJ5JBVGG3MWESPQ",
        "domain": null,
        "selected": false
    },
    {
        "ids": {
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAY3WP6674657FFA2JKBNQEWCCKA",
            "mons_sel_mkid": "amzn1.mp.o.A1RKKUPIHCS9HS"
        },
        "label": "西班牙",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.ADUILQ4FEWY2HTJ5JBVGG3MWESPQ",
        "domain": null,
        "selected": false
    },
    {
        "ids": {
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAY3WP6674657FFA2JKBNQEWCCKA",
            "mons_sel_mkid": "amzn1.mp.o.A1C3SOZRARQ6R3"
        },
        "label": "波兰",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.ADUILQ4FEWY2HTJ5JBVGG3MWESPQ",
        "domain": null,
        "selected": false
    },
    {
        "ids": {
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAY3WP6674657FFA2JKBNQEWCCKA",
            "mons_sel_mkid": "amzn1.mp.o.A2NODRKZP88ZB9"
        },
        "label": "瑞典",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.ADUILQ4FEWY2HTJ5JBVGG3MWESPQ",
        "domain": null,
        "selected": false
    },
    {
        "ids": {
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAY3WP6674657FFA2JKBNQEWCCKA",
            "mons_sel_mkid": "amzn1.mp.o.A28R8C7NBKEWEA"
        },
        "label": "爱尔兰",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.ADUILQ4FEWY2HTJ5JBVGG3MWESPQ",
        "domain": null,
        "selected": false
    },
    {
        "ids": {
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAY3WP6674657FFA2JKBNQEWCCKA",
            "mons_sel_mkid": "amzn1.mp.o.AMEN7PMS3EDWL"
        },
        "label": "比利时",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.ADUILQ4FEWY2HTJ5JBVGG3MWESPQ",
        "domain": null,
        "selected": false
    }
]
//美洲地区
export const regionalAccounts2 = [
    {
        "ids": {
            "mons_sel_mkid": "amzn1.mp.o.ATVPDKIKX0DER",
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAM5KIEXY47ATQGJ2EH6XYVEJNYQ"
        },
        "label": "美国",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.AAJALQOXAXDOGKQJ5SUN2JN4NJ7Q",
        "domain": null,
        "selected": true
    },
    {
        "ids": {
            "mons_sel_mkid": "amzn1.mp.o.A2Q3Y263D00KWC",
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAM5KIEXY47ATQGJ2EH6XYVEJNYQ"
        },
        "label": "巴西",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.AAJALQOXAXDOGKQJ5SUN2JN4NJ7Q",
        "domain": null,
        "selected": false
    },
    {
        "ids": {
            "mons_sel_mkid": "amzn1.mp.o.A2EUQ1WTGCTBG2",
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAM5KIEXY47ATQGJ2EH6XYVEJNYQ"
        },
        "label": "加拿大",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.AAJALQOXAXDOGKQJ5SUN2JN4NJ7Q",
        "domain": null,
        "selected": false
    },
    {
        "ids": {
            "mons_sel_mkid": "amzn1.mp.o.A1AM78C64UM0Y8",
            "mons_sel_dir_mcid": "amzn1.merchant.d.AAM5KIEXY47ATQGJ2EH6XYVEJNYQ"
        },
        "label": "墨西哥",
        "typeLabel": null,
        "globalAccountId": "amzn1.pa.d.AAJALQOXAXDOGKQJ5SUN2JN4NJ7Q",
        "domain": null,
        "selected": false
    }
]
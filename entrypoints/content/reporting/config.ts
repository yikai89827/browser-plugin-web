// 新页面的配置文件
// 定义新页面的各种配置项

// 字段映射配置 - 用于表头文本到字段名的映射
export const fieldMappingConfig = [
  { field: 'account_name', labels: ['account name', '账户名称'] },
  { field: 'campaign_name', labels: ['campaign name', '广告系列名称'] },
  { field: 'adset_name', labels: ['ad set name', '广告组名称'] },
  { field: 'ad_name', labels: ['ad name', '广告名称'] },
  { field: 'campaign_id', labels: ['campaign_id', '广告系列编号'] },
  { field: 'adset_id', labels: ['adset_id', '广告组编号'] },
  { field: 'ad_id', labels: ['ad_id', '广告编号'] },
  { field: 'spend', labels: ['amount spent', '已花费金额'] },
  { field: 'impressions', labels: ['impressions', '展示次数'] },
  { field: 'reach', labels: ['reach', '覆盖人数'] },
  { field: 'clicks', labels: ['clicks(all)', '点击量（全部）'] },
  { field: 'purchases', labels: ['purchases', '购物次数'] },
  { field: 'registrations', labels: ['registrations completed', '完成注册次数'] },
];
// 页脚映射配置
export const footerMapping = {
  // 报告页面的页脚映射
};

// 数值字段配置
export const numericFields = ['impressions', 'reach', 'spend', 'clicks', 'registrations', 'purchases'];

// 费用字段配置
export const costFields = [
  // 报告页面的费用字段
];

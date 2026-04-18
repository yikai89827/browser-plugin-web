// 数值类字段配置
const numericFields = ['impressions', 'reach', 'spend', 'results', 'costPerResult'];

// 清理广告名称
export function cleanAdName(name: string): string {
  if (!name) return '';
  // 移除多余的空白字符
  return name.trim().replace(/\s+/g, ' ');
}

// 生成唯一标识（按照popup页面上显示的数值类数据相加，然后加上名字）
export function generateUniqueId(name: string, originalValues: any): string {
  // 提取数值类字段并相加
  let sum = 0;
  
  console.log('原始值:', originalValues, numericFields, name);
  
  // 检查originalValues中的字段
  if (typeof originalValues === 'object' && originalValues !== null) {
    // 检查直接字段（从completeData提取的）
    numericFields.forEach(field => {
      if (originalValues[field] !== undefined) {
        let value = 0;
        const fieldValue = originalValues[field];
        if (typeof fieldValue === 'string') {
          // 清理数字字符串，移除非数字字符（除了小数点和负号）
          const cleanedText = fieldValue.replace(/[^\d.-]/g, '');
          value = parseFloat(cleanedText);
        } else {
          value = parseFloat(fieldValue);
        }
        if (!isNaN(value)) {
          // 取整，不需要保留小数
          const roundedValue = Math.round(value);
          sum += roundedValue;
          console.log(`从${field}提取并清理的值: ${fieldValue} → ${value} → ${roundedValue}`);
        }
      }
    });
  }
  
  console.log('计算唯一标识时的名称:', name);
  console.log('计算唯一标识时的数值总和:', sum);
  
  // 对总和取整，不需要保留小数
  const roundedSum = Math.round(sum);
  console.log('取整后的总和:', roundedSum);
  
  // 组合名字和数值总和，确保属性顺序一致
  const cleanedName = cleanAdName(name);
  // 确保字符串的一致性，移除所有不可见字符
  const sanitizedName = cleanedName.replace(/[\s\u00A0\u2000-\u200F\u2028-\u202F\u205F\u3000]/g, '').trim();
  
  // 转换为字符串并计算哈希值
  const str = `name${sanitizedName}sum${roundedSum}`;
  console.log('计算哈希的字符串:', str);
  console.log('字符串长度:', str.length);
  console.log('字符串字符码:', Array.from(str).map(c => c.charCodeAt(0)));
  
  // 使用 MD5 算法计算哈希值
  const uniqueId = md5(str);
  console.log('生成的唯一标识:', uniqueId);
  return uniqueId;
}

// 从缓存中获取原始值
export function getOriginalValueFromCache(adName: string, modifications: any[]): any {
  if (!modifications || !Array.isArray(modifications)) {
    return null;
  }
  
  // 查找匹配的修改记录
  const matchedModification = modifications.find(mod => 
    mod && mod.completeData && mod.completeData.name === adName
  );
  
  if (matchedModification) {
    return matchedModification.originalValues;
  }
  
  return null;
}

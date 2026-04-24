// 数据提取模块
// 负责从DOM中提取广告数据，包括编号字段

import { AdEntity, AdLevel } from './hierarchy';
import { numericFields, filterTexts } from './config';
import { getTableDataRows, findTableContainer, getColumnIndicesSync, getCurrentPageState, extractRowData } from './dom';

// 列索引映射
export interface ColumnIndices {
  [key: string]: number;
}

// 提取结果接口
export interface ExtractionResult {
  entities: AdEntity[];
  columnIndices: ColumnIndices;
  level: AdLevel;
  sortInfo: { field: string | null; direction: string | null };
}

// 数据提取管理器
class DataExtractor {
  // 从DOM提取数据
  async extractFromDom(): Promise<ExtractionResult> {
    // 使用dom.ts中的函数获取列索引
    const columnIndices = await getColumnIndicesSync();
    console.log(`  → 提取到的列索引: ${JSON.stringify(columnIndices)}`);
    // 检测排序信息
    const sortInfo:any = getCurrentPageState() || {};
    const entities = await this.extractEntities(sortInfo?.level, columnIndices);
    
    return {
      entities,
      columnIndices,
      level: sortInfo?.level || 'Campaigns',
      sortInfo
    };
  }

  // 检测当前层级
  private detectCurrentLevel(): AdLevel {
    if (typeof window === 'undefined' || !window.location) {
      return 'Campaigns';
    }

    const path = window.location.pathname;
    // 分割路径并获取最后一部分
    const pathParts = path.split('/').filter(part => part.trim() !== '');
    const lastPart = pathParts[pathParts.length - 1];
    
    if (lastPart === 'campaigns') {
      return 'Campaigns';
    } else if (lastPart === 'adsets') {
      return 'Adsets';
    } else if (lastPart === 'ads') {
      return 'Ads';
    }
    return 'Campaigns';
  }

  // 提取广告实体
  private async extractEntities(level: AdLevel, columnIndices: ColumnIndices): Promise<AdEntity[]> {
    const entities: AdEntity[] = [];
    
    // 使用dom.ts中的函数找到表格容器
    const tableContainer = await findTableContainer();
    if (!tableContainer) {
      console.warn('extractEntities: 未找到表格容器');
      return entities;
    }
    
    // 等待表格数据完全渲染，最多等待5秒
    let rowPairs: any[] = [];
    for (let i = 0; i < 10; i++) {
      rowPairs = getTableDataRows(tableContainer);
      if (rowPairs.length > 0) {
        break;
      }
      // 等待500ms后重试
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`  → 表格数据行数量: ${rowPairs.length}`);
    
    rowPairs.forEach((rowPair: any, rowIndex: number) => {
      const entity = this.extractEntityFromRowPair(rowPair, level, columnIndices, rowIndex);
      console.log(`  → 提取到的实体: ${JSON.stringify(entity)}`);
      if (entity) {
        console.log(`  → 过滤后的名称: ${entity.name}`);
        entities.push(entity);
      }
    });
    
    return entities;
  }

  // 从行对中提取广告实体
  private extractEntityFromRowPair(rowPair: { fixed: HTMLElement; scrollable: HTMLElement }, level: AdLevel, columnIndices: ColumnIndices, rowIndex: number): AdEntity | null {
    // 调用公共提取函数
    const { name: rawName, values: rawValues, fixedColumnLength } = extractRowData(rowPair, columnIndices);
    
    // 过滤掉name中的多余文本
    const name = this.filterNameText(rawName);
    
    // 提取编号字段（ID）
    const id = this.extractId(rawValues, level);
    if (!id) {
      return null;
    }
    
    // 根据层级提取相应的ID字段
    const idFields = this.extractIdFields(rawValues, level);
    
    // 处理数值字段
    const processedValues = this.processValues(rawValues);
    
    // 合并所有字段到一个对象中
    const adData = {
      id,
      name,
      level,
      ...processedValues,
      ...idFields,
      increaseValues: {}
    };
    
    return adData as AdEntity;
  }

  // 过滤名称文本，去除多余的按钮文本
  private filterNameText(name: string): string {    
    let filteredName = name;
    // 过滤掉所有不需要的文本
    filterTexts.forEach(text => {
      filteredName = filteredName.replace(new RegExp(text, 'g'), '').trim();
    });
    
    return filteredName;
  }

  // 提取编号
  private extractId(values: Record<string, string>, level: AdLevel): string {
    // 根据层级提取对应的编号
    switch (level) {
      case 'Campaigns':
        return values.campaign_id || values.id || `campaign_${Math.random().toString(36).slice(2, 9)}`;
      case 'Adsets':
        return values.adset_id || values.id || `adset_${Math.random().toString(36).slice(2, 9)}`;
      case 'Ads':
        return values.ad_id || values.id || `ad_${Math.random().toString(36).slice(2, 9)}`;
      default:
        return `entity_${Math.random().toString(36).slice(2, 9)}`;
    }
  }

  // 根据层级提取相应的ID字段
  private extractIdFields(values: Record<string, string>, level: AdLevel): Record<string, string> {
    const idFields: Record<string, string> = {};
    
    // 广告：需要包含 campaign_id, adset_id, ad_id
    if (level === 'Ads') {
      if (values.campaign_id) idFields.campaign_id = values.campaign_id;
      if (values.adset_id) idFields.adset_id = values.adset_id;
      if (values.ad_id) idFields.ad_id = values.ad_id;
    }
    // 广告组：需要包含 campaign_id, adset_id
    else if (level === 'Adsets') {
      if (values.campaign_id) idFields.campaign_id = values.campaign_id;
      if (values.adset_id) idFields.adset_id = values.adset_id;
    }
    // 广告系列：需要包含 campaign_id
    else if (level === 'Campaigns') {
      if (values.campaign_id) idFields.campaign_id = values.campaign_id;
    }
    // console.log(`  → 提取到的ID字段: ${JSON.stringify(idFields)}`);
    
    return idFields;
  }

  // 处理数值字段
  private processValues(values: Record<string, string>): Record<string, any> {
    const processedValues: Record<string, any> = {};
    
    for (const [field, value] of Object.entries(values)) {
      if (field === 'name') {
        continue; // 跳过name字段，只在AdEntity对象中存储
      }
      
      // console.log(`  → 处理字段值: ${field} = ${value}`);
      if (value) {
        // 检查是否为数值字段
        if (numericFields.includes(field)) {
          // 清理数值，去除货币符号和逗号
          const cleanedValue = value.replace(/[^\d.-]/g, '');
          const numValue = parseFloat(cleanedValue);
          if (!isNaN(numValue)) {
            processedValues[field] = numValue;
          } else {
            processedValues[field] = value;
          }
        } else {
          // 非数值字段保持原始值
          processedValues[field] = value;
        }
      }
    }
    // console.log(`  → 处理后的字段值: ${JSON.stringify(processedValues)}`);
    
    return processedValues;
  }
}

export const dataExtractor = new DataExtractor();
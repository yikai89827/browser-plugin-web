// 数据提取模块
// 负责从DOM中提取广告数据，包括编号字段

import { AdEntity, AdLevel } from './hierarchy';
import { numericFields, filterTexts } from './config';
import { getTableDataRows, findTableContainer, getColumnIndicesSync, detectSortInfo } from './dom';

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
  // 从DOM提取数据
  extractFromDom(): ExtractionResult {
    const level = this.detectCurrentLevel();
    // 使用dom.ts中的函数获取列索引
    const columnIndices = getColumnIndicesSync();
    console.log(`  → 提取到的列索引: ${JSON.stringify(columnIndices)}`);
    // 检测排序信息
    const sortInfo = detectSortInfo();
    const entities = this.extractEntities(level, columnIndices);
    
    return {
      entities,
      columnIndices,
      level,
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
  private extractEntities(level: AdLevel, columnIndices: ColumnIndices): AdEntity[] {
    const entities: AdEntity[] = [];
    
    // 使用dom.ts中的函数找到表格容器
    const tableContainer = findTableContainer();
    if (!tableContainer) {
      console.warn('extractEntities: 未找到表格容器');
      return entities;
    }
    
    
    // 使用dom.ts中的函数获取表格数据行
    const rowPairs = getTableDataRows(tableContainer);

    console.log(`  → 表格数据行数量: ${rowPairs.length}`);
    
    rowPairs.forEach((rowPair, rowIndex) => {
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
    // 从固定列提取名称
    const nameDiv = rowPair.fixed.querySelector('div');
    let name = nameDiv?.textContent?.trim() || '';
    
    // 过滤掉name中的多余文本，比如"复制"等按钮文本
    name = this.filterNameText(name);
    
    // 从可滚动列提取数据 - 直接获取所有div元素，与dom.ts保持一致
    const cells = Array.from(rowPair.scrollable.querySelectorAll('div'));
    console.log(`  → 可滚动列单元格数量: ${cells.length}`);
    
    // 提取编号字段（ID）
    const id = this.extractId(cells, level, columnIndices);
    console.log(`  → 提取到的编号: ${id}`);
    if (!id) {
      return null;
    }
    
    // 根据层级提取相应的ID字段
    const idFields = this.extractIdFields(cells, level, columnIndices);
    console.log(`  → 提取到的ID字段: ${JSON.stringify(idFields)}`);
    
    // 提取所有字段值
    const values = this.extractAllFields(cells, columnIndices); 
    console.log(`  → 提取到的所有字段值: ${JSON.stringify(values)}`);
    
    // 将ID字段合并到values中
    Object.assign(values, idFields);
    console.log(`  → 合并后的所有字段值: ${JSON.stringify(values)}`);
    
    return {
      id,
      name,
      level,
      values,
      increaseValues: {}
    };
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
  private extractId(cells: Element[], level: AdLevel, columnIndices: ColumnIndices): string {
    // 根据层级提取对应的编号
    switch (level) {
      case 'Campaigns':
        return this.extractCellValue(cells, columnIndices, 'campaign_id') || 
               this.extractCellValue(cells, columnIndices, 'id') || 
               `campaign_${Math.random().toString(36).slice(2, 9)}`;
      case 'Adsets':
        return this.extractCellValue(cells, columnIndices, 'adset_id') || 
               this.extractCellValue(cells, columnIndices, 'id') || 
               `adset_${Math.random().toString(36).slice(2, 9)}`;
      case 'Ads':
        return this.extractCellValue(cells, columnIndices, 'ad_id') || 
               this.extractCellValue(cells, columnIndices, 'id') || 
               `ad_${Math.random().toString(36).slice(2, 9)}`;
      default:
        return `entity_${Math.random().toString(36).slice(2, 9)}`;
    }
  }

  // 根据层级提取相应的ID字段
  private extractIdFields(cells: Element[], level: AdLevel, columnIndices: ColumnIndices): Record<string, string> {
    const idFields: Record<string, string> = {};
    
    // 广告：需要包含 campaign_id, adset_id, ad_id
    if (level === 'Ads') {
      const campaignId = this.extractCellValue(cells, columnIndices, 'campaign_id');
      const adsetId = this.extractCellValue(cells, columnIndices, 'adset_id');
      const adId = this.extractCellValue(cells, columnIndices, 'ad_id');
      
      if (campaignId) idFields.campaign_id = campaignId;
      if (adsetId) idFields.adset_id = adsetId;
      if (adId) idFields.ad_id = adId;
    }
    // 广告组：需要包含 campaign_id, adset_id
    else if (level === 'Adsets') {
      const campaignId = this.extractCellValue(cells, columnIndices, 'campaign_id');
      const adsetId = this.extractCellValue(cells, columnIndices, 'adset_id');
      
      if (campaignId) idFields.campaign_id = campaignId;
      if (adsetId) idFields.adset_id = adsetId;
    }
    // 广告系列：需要包含 campaign_id
    else if (level === 'Campaigns') {
      const campaignId = this.extractCellValue(cells, columnIndices, 'campaign_id');
      
      if (campaignId) idFields.campaign_id = campaignId;
    }
    console.log(`  → 提取到的ID字段: ${JSON.stringify(idFields)}`);
    
    return idFields;
  }

  // 提取所有字段值
  private extractAllFields(cells: Element[], columnIndices: ColumnIndices): Record<string, any> {
    const values: Record<string, any> = {};
    
    // 遍历所有列索引中的字段，排除name字段（因为name已经作为AdEntity的直接属性存储）
    for (const field of Object.keys(columnIndices)) {
      if (field === 'name') {
        continue; // 跳过name字段，只在AdEntity对象中存储
      }
      
      const value = this.extractCellValue(cells, columnIndices, field);
      console.log(`  → 提取到的字段值1: ${field} = ${value}`);
      if (value) {
        console.log(`  → 提取到的字段值2: ${field} = ${value}`);
        // 检查是否为数值字段
        if (numericFields.includes(field)) {
          // 清理数值，去除货币符号和逗号
          const cleanedValue = value.replace(/[\$,]/g, '');
          const numValue = parseFloat(cleanedValue);
          if (!isNaN(numValue)) {
            values[field] = numValue;
          } else {
            values[field] = value;
          }
        } else {
          // 非数值字段保持原始值
          values[field] = value;
        }
      }
    }
    console.log(`  → 提取到的所有字段值: ${JSON.stringify(values)}`);
    
    return values;
  }

  // 提取单元格值
  private extractCellValue(cells: Element[], columnIndices: ColumnIndices, field: string): string {
    const index = columnIndices[field];
    console.log(`  → 提取到的字段索引: ${field} = ${index}`);
    if (index !== undefined && cells[index]) {
      return cells[index].textContent?.trim() || '';
    }
    return '';
  }
}

export const dataExtractor = new DataExtractor();

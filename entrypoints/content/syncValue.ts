// 数值同步模块
// 负责处理层级关系的数值同步

import { AdEntity, hierarchyManager } from './hierarchy';
import { numericFields } from './config';
import {  updateDomRowByEntity } from './dom';

// 同步类型
export type SyncDirection = 'up' | 'down'; // up: 向上同步（子级到父级）, down: 向下同步（父级到子级）

// 同步结果
export interface SyncResult {
  success: boolean;
  syncedEntities: AdEntity[];
  message: string;
}

// 数值同步管理器
class ValueSyncManager {
  // 向下同步：从父级同步到子级
  async syncDown(fromEntity: AdEntity, fields: string[] = numericFields): Promise<SyncResult> {
    const syncedEntities: AdEntity[] = [];
    
    try {
      // 广告系列 -> 广告组
      if (fromEntity.level === 'Campaigns') {
        // 从DOM中查找对应的广告组行
        const adsetRow = this.findChildRowInDom(fromEntity.id, 'Adsets');
        if (adsetRow) {
          // 同步值到广告组行
          await this.syncValuesToDom(adsetRow, fromEntity, fields);
          syncedEntities.push(adsetRow);
          
          // 广告组 -> 广告
          const adRow = this.findChildRowInDom(adsetRow.id, 'Ads');
          if (adRow) {
            await this.syncValuesToDom(adRow, adsetRow, fields);
            syncedEntities.push(adRow);
          }
        }
      }
      
      // 广告组 -> 广告
      else if (fromEntity.level === 'Adsets') {
        const adRow = this.findChildRowInDom(fromEntity.id, 'Ads');
        if (adRow) {
          await this.syncValuesToDom(adRow, fromEntity, fields);
          syncedEntities.push(adRow);
        }
      }
      
      return {
        success: true,
        syncedEntities,
        message: `成功向下同步 ${syncedEntities.length} 个实体`
      };
    } catch (error: any) {
      return {
        success: false,
        syncedEntities,
        message: `同步失败: ${error?.message || '未知错误'}`
      };
    }
  }

  // 向上同步：从子级同步到父级
  async syncUp(fromEntity: AdEntity, fields: string[] = numericFields): Promise<SyncResult> {
    const syncedEntities: AdEntity[] = [];
    
    try {
      // 广告 -> 广告组
      if (fromEntity.level === 'Ads') {
        const adsetRow = this.findParentRowInDom(fromEntity.id, 'Adsets');
        if (adsetRow) {
          await this.syncValuesToDom(adsetRow, fromEntity, fields);
          syncedEntities.push(adsetRow);
          
          // 广告组 -> 广告系列
          const campaignRow = this.findParentRowInDom(adsetRow.id, 'Campaigns');
          if (campaignRow) {
            await this.syncValuesToDom(campaignRow, adsetRow, fields);
            syncedEntities.push(campaignRow);
          }
        }
      }
      
      // 广告组 -> 广告系列
      else if (fromEntity.level === 'Adsets') {
        const campaignRow = this.findParentRowInDom(fromEntity.id, 'Campaigns');
        if (campaignRow) {
          await this.syncValuesToDom(campaignRow, fromEntity, fields);
          syncedEntities.push(campaignRow);
        }
      }
      
      return {
        success: true,
        syncedEntities,
        message: `成功向上同步 ${syncedEntities.length} 个实体`
      };
    } catch (error: any) {
      return {
        success: false,
        syncedEntities,
        message: `同步失败: ${error?.message || '未知错误'}`
      };
    }
  }

  // 在DOM中查找子级行
  private findChildRowInDom(parentId: string, childLevel: string): AdEntity | null {
    const hierarchy = hierarchyManager.getHierarchy();
    
    if (childLevel === 'Adsets') {
      // 查找广告组：ID包含父级广告系列ID的广告组
      const adsets = Object.values(hierarchy.adsets);
      for (const adset of adsets) {
        if (adset.id.includes(parentId) || parentId.includes(adset.id.split('_')[0])) {
          return adset;
        }
      }
      // 如果没找到，尝试通过名称匹配
      const parent = hierarchyManager.getEntity(parentId, 'Campaigns');
      if (parent) {
        const matchingAdset = adsets.find(adset => adset.name.includes(parent.name) || parent.name.includes(adset.name));
        if (matchingAdset) return matchingAdset;
      }
    }
    
    if (childLevel === 'Ads') {
      // 查找广告：ID包含父级广告组ID的广告
      const ads = Object.values(hierarchy.ads);
      for (const ad of ads) {
        if (ad.id.includes(parentId) || parentId.includes(ad.id.split('_')[0])) {
          return ad;
        }
      }
      // 如果没找到，尝试通过名称匹配
      const parent = hierarchyManager.getEntity(parentId, 'Adsets');
      if (parent) {
        const matchingAd = ads.find(ad => ad.name.includes(parent.name) || parent.name.includes(ad.name));
        if (matchingAd) return matchingAd;
      }
    }
    
    return null;
  }

  // 在DOM中查找父级行
  private findParentRowInDom(childId: string, parentLevel: string): AdEntity | null {
    const hierarchy = hierarchyManager.getHierarchy();
    
    if (parentLevel === 'Campaigns') {
      // 查找广告系列：其ID被广告组ID包含
      const campaigns = Object.values(hierarchy.campaigns);
      for (const campaign of campaigns) {
        if (childId.includes(campaign.id) || campaign.id.includes(childId.split('_')[0])) {
          return campaign;
        }
      }
    }
    
    if (parentLevel === 'Adsets') {
      // 查找广告组：其ID被广告ID包含
      const adsets = Object.values(hierarchy.adsets);
      for (const adset of adsets) {
        if (childId.includes(adset.id) || adset.id.includes(childId.split('_')[0])) {
          return adset;
        }
      }
    }
    
    return null;
  }

  // 同步数值到DOM
  private async syncValuesToDom(targetEntity: AdEntity, fromEntity: AdEntity, fields: string[]) {
    const totalValues: Record<string, number> = {};
    
    fields.forEach(field => {
      // 计算同步后的总值
      const originalValue = targetEntity.values[field] || 0;
      const increaseValue = fromEntity.increaseValues[field] || 0;
      totalValues[field] = originalValue + increaseValue;
      
      console.log(`同步字段 ${field}: 从 ${fromEntity.name} (${fromEntity.id}) 到 ${targetEntity.name} (${targetEntity.id})，原始值: ${originalValue}, 增加值: ${increaseValue}, 新值: ${totalValues[field]}`);
    });
    
    // 在DOM中查找对应的行并更新
    await updateDomRowByEntity(targetEntity, totalValues);
  }

  // 同步数值（内存中）
  private syncValues(from: AdEntity, to: AdEntity, fields: string[]) {
    fields.forEach(field => {
      // 同步增加值
      const increaseValue = from.increaseValues[field] || 0;
      to.increaseValues[field] = increaseValue;
      
      // 计算新的总值
      const originalValue = to.values[field] || 0;
      to.values[field] = originalValue + increaseValue;
      
      console.log(`同步字段 ${field}: 从 ${from.name} (${from.id}) 到 ${to.name} (${to.id})，增加值: ${increaseValue}`);
    });
  }

  // 批量同步
  async batchSync(entities: AdEntity[], direction: SyncDirection = 'down'): Promise<SyncResult> {
    const allSynced: AdEntity[] = [];
    let allSuccess = true;
    
    for (const entity of entities) {
      let result: SyncResult;
      if (direction === 'down') {
        result = await this.syncDown(entity);
      } else {
        result = await this.syncUp(entity);
      }
      
      allSynced.push(...result.syncedEntities);
      if (!result.success) {
        allSuccess = false;
      }
    }
    
    return {
      success: allSuccess,
      syncedEntities: allSynced,
      message: `批量同步完成，成功同步 ${allSynced.length} 个实体`
    };
  }

  // 重置所有增加值
  resetIncreaseValues() {
    const hierarchy = hierarchyManager.getHierarchy();
    
    // 重置广告系列
    Object.values(hierarchy.campaigns).forEach(campaign => {
      Object.keys(campaign.increaseValues).forEach(field => {
        campaign.increaseValues[field] = 0;
      });
    });
    
    // 重置广告组
    Object.values(hierarchy.adsets).forEach(adset => {
      Object.keys(adset.increaseValues).forEach(field => {
        adset.increaseValues[field] = 0;
      });
    });
    
    // 重置广告
    Object.values(hierarchy.ads).forEach(ad => {
      Object.keys(ad.increaseValues).forEach(field => {
        ad.increaseValues[field] = 0;
      });
    });
  }

  // 计算同步后的总值
  calculateTotalValues(entity: AdEntity): Record<string, number> {
    const totalValues: Record<string, number> = {};
    
    numericFields.forEach(field => {
      const originalValue = entity.values[field] || 0;
      const increaseValue = entity.increaseValues[field] || 0;
      totalValues[field] = originalValue + increaseValue;
    });
    
    return totalValues;
  }
}

export const valueSyncManager = new ValueSyncManager();

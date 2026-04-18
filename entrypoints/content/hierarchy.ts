// 层级关系管理模块
// 负责处理广告系列、广告组、广告之间的层级关系

// 广告层级类型
export type AdLevel = 'Campaigns' | 'Adsets' | 'Ads';

// 广告实体类型
export interface AdEntity {
  id: string; // 唯一标识符（使用编号字段）
  name: string;
  level: AdLevel;
  parentId?: string; // 父级ID
  values: Record<string, number>; // 数值字段
  increaseValues: Record<string, number>; // 增加值
}

// 层级关系映射
export interface HierarchyMap {
  campaigns: Record<string, AdEntity>; // 广告系列
  adsets: Record<string, AdEntity>; // 广告组
  ads: Record<string, AdEntity>; // 广告
}

// 层级关系管理器
class HierarchyManager {
  private hierarchy: HierarchyMap = {
    campaigns: {},
    adsets: {},
    ads: {}
  };

  // 清理层级关系
  clear() {
    this.hierarchy = {
      campaigns: {},
      adsets: {},
      ads: {}
    };
  }

  // 添加广告实体
  addEntity(entity: AdEntity) {
    switch (entity.level) {
      case 'Campaigns':
        this.hierarchy.campaigns[entity.id] = entity;
        break;
      case 'Adsets':
        this.hierarchy.adsets[entity.id] = entity;
        break;
      case 'Ads':
        this.hierarchy.ads[entity.id] = entity;
        break;
    }
  }

  // 获取广告实体
  getEntity(id: string, level: AdLevel): AdEntity | null {
    switch (level) {
      case 'Campaigns':
        return this.hierarchy.campaigns[id] || null;
      case 'Adsets':
        return this.hierarchy.adsets[id] || null;
      case 'Ads':
        return this.hierarchy.ads[id] || null;
      default:
        return null;
    }
  }

  // 获取所有广告系列
  getCampaigns(): AdEntity[] {
    return Object.values(this.hierarchy.campaigns);
  }

  // 获取广告组的广告系列
  getAdsetCampaign(adsetId: string): AdEntity | null {
    const adset = this.hierarchy.adsets[adsetId];
    if (adset && adset.parentId) {
      return this.hierarchy.campaigns[adset.parentId] || null;
    }
    return null;
  }

  // 获取广告的广告组
  getAdAdset(adId: string): AdEntity | null {
    const ad = this.hierarchy.ads[adId];
    if (ad && ad.parentId) {
      return this.hierarchy.adsets[ad.parentId] || null;
    }
    return null;
  }

  // 获取广告的广告系列
  getAdCampaign(adId: string): AdEntity | null {
    const adset = this.getAdAdset(adId);
    if (adset && adset.parentId) {
      return this.hierarchy.campaigns[adset.parentId] || null;
    }
    return null;
  }

  // 获取广告系列的所有广告组
  getCampaignAdsets(campaignId: string): AdEntity[] {
    return Object.values(this.hierarchy.adsets).filter(adset => adset.parentId === campaignId);
  }

  // 获取广告组的所有广告
  getAdsetAds(adsetId: string): AdEntity[] {
    return Object.values(this.hierarchy.ads).filter(ad => ad.parentId === adsetId);
  }

  // 获取层级关系映射
  getHierarchy(): HierarchyMap {
    return this.hierarchy;
  }

  // 检测层级关系
  detectHierarchy(entities: AdEntity[]) {
    this.clear();
    
    // 首先添加所有实体
    entities.forEach(entity => this.addEntity(entity));

    // 然后建立父子关系
    Object.values(this.hierarchy.adsets).forEach(adset => {
      // 广告组的父级是广告系列，通过ID匹配
      const campaignId = this.findParentCampaignId(adset.id);
      if (campaignId) {
        adset.parentId = campaignId;
      }
    });

    Object.values(this.hierarchy.ads).forEach(ad => {
      // 广告的父级是广告组，通过ID匹配
      const adsetId = this.findParentAdsetId(ad.id);
      if (adsetId) {
        ad.parentId = adsetId;
      }
    });
  }

  // 根据广告组ID查找父级广告系列ID
  private findParentCampaignId(adsetId: string): string | null {
    // 遍历所有广告系列，查找匹配的ID
    for (const campaignId in this.hierarchy.campaigns) {
      // 检查广告组ID是否包含广告系列ID
      if (adsetId.includes(campaignId)) {
        return campaignId;
      }
    }
    return null;
  }

  // 根据广告ID查找父级广告组ID
  private findParentAdsetId(adId: string): string | null {
    // 遍历所有广告组，查找匹配的ID
    for (const adsetId in this.hierarchy.adsets) {
      // 检查广告ID是否包含广告组ID
      if (adId.includes(adsetId)) {
        return adsetId;
      }
    }
    return null;
  }
}

export const hierarchyManager = new HierarchyManager();

/**
 * Relay `variables` for ProfileCometTimelineFeedRefetchQuery (doc_id 8746866475413837).
 * Shape aligned with a successful browser capture; `id` must be the profile owner's numeric uid when possible.
 */

const RELAY_INTERNAL_PV: Record<string, boolean | number> = {
  __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: false,
  __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: false,
  __relay_internal__pv__IsWorkUserrelayprovider: false,
  __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
  __relay_internal__pv__CometFeedStoryDynamicResolutionPhotoAttachmentRenderer_experimentWidthrelayprovider: 600,
  __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
  __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
  __relay_internal__pv__IsMergQAPollsrelayprovider: false,
  __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true,
  __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
  __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
  __relay_internal__pv__CometIsReplyPagerDisabledrelayprovider: false,
  __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: true,
  __relay_internal__pv__CometFeedPYMKHScrollInitialPaginationCountrelayprovider: 10,
  __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: false,
  __relay_internal__pv__EventCometCardImage_prefetchEventImagerelayprovider: false,
};

export function buildProfileCometTimelineFeedRefetchVariables(profileId: string): Record<string, unknown> {
  return {
    afterTime: null,
    beforeTime: null,
    count: 3,
    cursor: '',
    feedLocation: 'TIMELINE',
    feedbackSource: 0,
    focusCommentID: null,
    memorializedSplitTimeFilter: null,
    omitPinnedPost: true,
    postedBy: null,
    privacy: null,
    privacySelectorRenderLocation: 'COMET_STREAM',
    renderLocation: 'timeline',
    scale: 2,
    stream_count: 1,
    taggedInOnly: null,
    trackingCode: null,
    useDefaultActor: false,
    id: profileId,
    ...RELAY_INTERNAL_PV,
  };
}

# Conversation Summary for Handoff

## Project
**fbControl** (`D:\work\fbControl`) — Chrome extension + Vue site for Facebook ad account batch management. Reference plugin: **fbspider 2.2.4** (`D:\work\fbspider2.2.4`).

## User Goals (arc)
1. Resolve vanity Facebook profile URLs for **friend check** (e.g. `samad.raza.20577`, `stefan.huberbauer`) via Comet `ProfileCometTimelineFeedRefetchQuery`.
2. **UI**: Show **original user input** (URL or UID) in result cards, not resolved numeric ID.
3. **Batch drawer button flow** after friend check:
   - Any success → bottom button **「确定」** → authorize **only successful** UIDs.
   - All fail → red **「重新检测好友关系」**.
   - Any fail on op tab → red **「重新检测好友关系」**.
4. Understand how **fbspider** implements authorization and what **friend check** is for.
5. Fix **authorization failures** for vanity URLs.

## Work Completed in fbControl

### Vanity / friend check (backend)
- `utils/fb/resolveFacebookVanityCometApi.ts` — Comet bootstrap + GraphQL timeline refetch (`doc_id` `8746866475413837`), exclude viewer ID from HTML extract.
- `utils/fb/extractFacebookProfileOwnerId.ts` — HTML proximity extraction with exclude set.
- `utils/messaging/fbControl/profileResolveHandlers.ts` — `FB_CONTROL_RESOLVE_PROFILE_NUMERIC_ID`.
- `site/src/lib/extensionBridge.ts` — `verifyFriendCheckWithExtensionVanityFallback`, sequential friend check.

### UI — original input display
- `displayInput` on `UidGraphVerifyDetailRow` / `AdAccountBatchResultRow`.
- `friendCheckDisplayInput()` in `graphAdAccountBatchOperations.ts`.
- `BatchOperationDrawer.vue` — **「检测账号」** shows `displayInput`; friend cards use `resultKind: 'friend_uid'`.

### UI — button logic + authorize snapshot
- `BatchOperationDrawer.vue`: `friendAuthorizeSnapshot`, `friendRunAction`, `friendAuthorizeAction`, `confirmDisabled`, red `bod-btn-confirm--danger`.
- On confirm after friend check: `payload.authorizedUsers` + numeric `uidsText` from snapshot only.
- `batchOperationTypes.ts`: `BatchAuthorizedUser`, `authorizedUsers?` on `BatchDrawerSubmitPayload`.

### Authorization fixes
- `graphAdAccountBatchOperations.ts`:
  - `uidPairsForBatchPayload()` prefers `payload.authorizedUsers`.
  - `GraphBatchOperationOptions.resolveProfileNumericId` — Comet fallback in `resolveFacebookUserRefToNumericId`.
  - `postAssignedUser` → `POST graph.facebook.com/v21.0/act_{id}/assigned_users` with `user` + `tasks` JSON.
  - Auth result cards get `displayInput`; errors use display label not vanity username.
- `extensionBridge.ts`: passes `resolveFacebookProfileNumericIdFromExtension` into `executeAdAccountBatchOperation`.

### fbspider analysis (partial — code obfuscated)
- Core logic in `background.js` (~22万字符, obfuscated).
- Found: `getEAA()` (EAAB token), **Graph Batch API** (`access_token` + `batch` + `suppress_http_code`), `relative_url` to `act_*`, config keys `aduserListBatch`, `aduserDataurl`.
- Same Marketing API surface as fbControl: **`assigned_users`**.
- `api.fbspider.com` for product/licensing; UI on `fbspider.com` via `content-main.js`.
- **Could not fully deobfuscate** friend-check-specific strings in `background.js` (almost no plaintext「好友」/friend-check); `decrypted-*.js` files are mostly string tables or placeholders, not full logic.
- Prior capture showed fbspider success for `ProfileCometTimelineFeedRefetchQuery` on vanity URLs (friend message「是好友」).

## Current User Issue (latest)

**Scenario:**
- Selected ad account: **`940870165585058`** (Aizaz Khan) — correct in result card.
- Step 1 input: `https://www.facebook.com/stefan.huberbauer`
- Friend check: **passed** (1 user OK).
- Authorization: **failed**

**Error (after vanity resolution fix):**
```
code=100 | subcode=1752100
用户不属于业务账户范畴 | 请提供业务用户或系统用户编号
```

**Analysis given to user:**
- Account selection is correct; failure is on **target user**, not wrong `act_` ID.
- **Friend check** (personal social graph / Comet timeline) ≠ **ad account permission** (BM-scoped `assigned_users`).
- `POST act_{id}/assigned_users` requires user to be a **Business Manager user** (or system user) already in the business that owns the ad account — not merely a personal Facebook friend.
- Ad account lives under BM asset group (e.g. ZZZ); `stefan.huberbauer` likely not in that BM.

**User follow-up question (unanswered in depth):**
> What does fbspider's friend check do? It doesn't say user must join BM — how does it authorize?

**Best answer so far (needs verification):**
- Friend check in fbspider is likely a **pre-filter** (avoid wasting API calls / wrong targets), using same Comet/Graph pattern as fbControl.
- Authorization in fbspider still appears to use **`assigned_users`** via Graph Batch — **same Meta rules**. Success cases may be users **already in BM**, or invited manually first. Plugin UI may not surface BM requirement clearly.
- fbspider does **not** appear to bypass BM via a different public API in recovered `background.js` snippets.

## Key Files
| File | Role |
|------|------|
| `site/src/components/BatchOperationDrawer.vue` | Drawer UI, friend snapshot, buttons, result cards |
| `utils/fb/graphAdAccountBatchOperations.ts` | Friend verify, `postAssignedUser`, batch ops |
| `site/src/lib/extensionBridge.ts` | Extension bridge, friend check, batch execute |
| `site/src/lib/batchOperationTypes.ts` | Payload types |
| `utils/fb/resolveFacebookVanityCometApi.ts` | Vanity → numeric ID |
| `D:\work\fbspider2.2.4\background.js` | fbspider core (obfuscated) |

## Errors Resolved vs Open

| Error | Status |
|-------|--------|
| GraphQL 1357004 on vanity resolve | Addressed in code (Comet alignment); runtime re-test incomplete |
| `subcode=33` — object `stefan.huberbauer` doesn't exist | Fixed via snapshot + Comet resolve on authorize |
| `subcode=1752100` — not business-scoped user | **Not a code bug** — Meta/BM policy; explain to user |
| UI showing numeric ID instead of URL | Fixed with `displayInput` |

## Recommended Next Steps
1. **Answer user** clearly: friend check = social relationship gate; authorize = BM `assigned_users`; suggest inviting user to BM first.
2. **Optional product improvement**: Map `subcode=1752100` to friendly Chinese message in `formatGraphErrorBody` or `add_ad_permissions` error handling.
3. **Optional**: Step 2 hint in `batchOperationPresets.ts` — clarify「好友通过仅表示社交关系，不代表可授权；被授权人需先加入该广告账户所属 Business Manager」.
4. **fbspider**: If needed, capture fbspider network traffic during successful authorize vs failed case to compare request bodies (batch items, user id type).
5. **Do not commit** unless user asks.

## Test Notes
- User runs `npm run site:dev`.
- Test vanity: `stefan.huberbauer`, ad account `940870165585058`.
- Logged-in viewer ~`61577254146356` (Aizaz Khan profile).

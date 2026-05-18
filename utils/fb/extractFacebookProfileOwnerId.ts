/**
 * 在 facebook.com 个人主页标签内执行：从 DOM / 内嵌 JSON / meta 尽量解析「主页主人」数字 id。
 * 注意：GraphQL 表单里的 __user / av 多为当前登录用户，不能当作对方 uid。
 */

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectExcludeSet(excludeNumericIds?: readonly string[]): Set<string> {
  const s = new Set<string>();
  if (!excludeNumericIds) return s;
  for (const id of excludeNumericIds) {
    if (id && /^\d{10,}$/.test(id)) s.add(id);
  }
  return s;
}

function firstIdInSlice(slice: string, re: RegExp, exclude: Set<string>): string | null {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const id = m[1];
    if (id && /^\d{10,}$/.test(id) && !exclude.has(id)) return id;
  }
  return null;
}

/** 在 vanity 字符串附近窗口内按优先级找 profile / user 相关 id，并排除 viewer 等 */
function extractNearVanityWindows(html: string, vanity: string, exclude: Set<string>): string | null {
  const esc = escapeRe(vanity);
  const marker = new RegExp(esc, 'gi');
  const win = 1400;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(html)) !== null) {
    const start = Math.max(0, m.index - win);
    const end = Math.min(html.length, m.index + win);
    const slice = html.slice(start, end);
    const patterns: RegExp[] = [
      /"profileID"\s*:\s*"(\d{10,})"/gi,
      /"userID"\s*:\s*"(\d{10,})"/gi,
      /"content_owner_id_new"\s*:\s*"(\d{10,})"/gi,
      /"profile_id"\s*:\s*"(\d{10,})"/gi,
      /"actorID"\s*:\s*"(\d{10,})"/gi,
      /"__typename"\s*:\s*"User"\s*,\s*"id"\s*:\s*"(\d{10,})"/g,
    ];
    for (const re of patterns) {
      const hit = firstIdInSlice(slice, re, exclude);
      if (hit) return hit;
    }
    const gen = firstIdInSlice(slice, /"id"\s*:\s*"(\d{10,})"/g, exclude);
    if (gen) return gen;
  }
  return null;
}

/** 从 profile 地址栏路径取 vanity（不含 profile.php?id=） */
export function extractVanityFromFacebookProfileUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (!host.endsWith('facebook.com') && !host.endsWith('fb.com')) return null;
    const pathname = (u.pathname || '/').replace(/\/+$/, '') || '/';
    if (pathname.toLowerCase().includes('profile.php')) return null;
    const segments = pathname.split('/').filter(Boolean);
    if (!segments.length) return null;
    const first = segments[0];
    if (/^\d+$/.test(first)) return null;
    if (!/^[a-zA-Z0-9.]+$/.test(first) || first.length > 50) return null;
    return first;
  } catch {
    return null;
  }
}

/**
 * 从 HTML 字符串解析主页数字 id（扩展 SW fetch bootstrap 与 content 脚本共用逻辑）。
 * @param excludeNumericIds 需排除的数字 id（例如当前登录用户的 c_user），避免把 viewer 误当主页主人。
 */
export function extractFacebookProfileOwnerNumericIdFromHtml(
  html: string,
  profileUrlHint: string,
  excludeNumericIds?: readonly string[],
): string | null {
  const exclude = collectExcludeSet(excludeNumericIds);
  const vanity =
    extractVanityFromFacebookProfileUrl(profileUrlHint) ||
    (typeof window !== 'undefined' ? extractVanityFromFacebookProfileUrl(window.location.href) : null);

  const metaAndroid = html.match(/<meta\s+property="al:android:url"\s+content="([^"]*)"/i);
  const metaIos = html.match(/<meta\s+property="al:ios:url"\s+content="([^"]*)"/i);
  for (const h of [metaAndroid?.[1], metaIos?.[1]]) {
    if (!h) continue;
    const m = h.match(/fb:\/\/profile\/(\d{10,})/);
    if (m?.[1] && !exclude.has(m[1])) return m[1];
  }

  const metaPidM = html.match(/<meta\s+property="fb:profile_id"\s+content="(\d{10,})"/i);
  if (metaPidM?.[1] && !exclude.has(metaPidM[1])) return metaPidM[1];

  if (vanity) {
    const near = extractNearVanityWindows(html, vanity, exclude);
    if (near) return near;

    const v = escapeRe(vanity);
    const proximity: RegExp[] = [
      new RegExp(`"userVanity"\\s*:\\s*"${v}"\\s*,\\s*"id"\\s*:\\s*"?(\\d{10,})"?`, 'i'),
      new RegExp(`"userVanity"\\s*:\\s*"${v}"[\\s\\S]{0,900}?"id"\\s*:\\s*"?(\\d{10,})"?`, 'i'),
      new RegExp(`"vanity"\\s*:\\s*"${v}"[\\s\\S]{0,1200}?"profileID"\\s*:\\s*"?(\\d{10,})"?`, 'i'),
      new RegExp(`"vanity"\\s*:\\s*"${v}"[\\s\\S]{0,1200}?"id"\\s*:\\s*"?(\\d{10,})"?`, 'i'),
      new RegExp(`"username"\\s*:\\s*"${v}"[\\s\\S]{0,1200}?"userID"\\s*:\\s*"?(\\d{10,})"?`, 'i'),
    ];
    for (const re of proximity) {
      const m = html.match(re);
      if (m?.[1] && !exclude.has(m[1])) return m[1];
    }
  }

  const fbUrls = html.match(/fb:\/\/profile\/(\d{10,})/g);
  if (fbUrls?.length) {
    const ids = fbUrls
      .map((x) => x.replace('fb://profile/', ''))
      .filter((id) => /^\d{10,}$/.test(id) && !exclude.has(id));
    if (ids.length === 1) return ids[0];
    if (ids.length > 1) {
      const counts = new Map<string, number>();
      for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
      let best = '';
      let n = 0;
      for (const [id, c] of counts) {
        if (exclude.has(id)) continue;
        if (c > n) {
          n = c;
          best = id;
        }
      }
      if (best) return best;
    }
  }

  return null;
}

/**
 * 在页面 document 中解析主页数字 id（仅应在 https://*.facebook.com/* 上调用）。
 */
export function extractFacebookProfileOwnerNumericIdFromDocument(profileUrlHint: string): string | null {
  const html = document.documentElement?.innerHTML || '';
  return extractFacebookProfileOwnerNumericIdFromHtml(html, profileUrlHint || window.location.href);
}

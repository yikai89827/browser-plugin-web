/** 将管理后台 URL 解析为 manifest 所需的 host / externally_connectable 模式 */
export function parseAdminUrlForManifest(adminUrl?: string): {
  hostPermissions: string[];
  externallyConnectable: string[];
  webAccessibleMatches: string[];
} {
  const externallyConnectable = [
    'http://localhost:*/*',
    'http://127.0.0.1:*/*',
  ];
  const hostPermissions: string[] = [];
  const webAccessibleMatches = [
    'http://localhost/*',
    'http://127.0.0.1/*',
  ];

  const raw = (adminUrl || '').trim();
  if (!raw) {
    return { hostPermissions, externallyConnectable, webAccessibleMatches };
  }

  try {
    const u = new URL(raw);
    const host = u.hostname;
    const scheme = u.protocol.replace(':', '');
    if (!host || host === 'localhost' || host === '127.0.0.1') {
      return { hostPermissions, externallyConnectable, webAccessibleMatches };
    }

    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    const hostPerm = `${scheme}://${host}/*`;
    hostPermissions.push(hostPerm);
    webAccessibleMatches.push(hostPerm);
    externallyConnectable.push(
      isIp ? `${scheme}://${host}:*/*` : `${scheme}://${host}/*`
    );
  } catch {
    /* ignore invalid URL */
  }

  return { hostPermissions, externallyConnectable, webAccessibleMatches };
}

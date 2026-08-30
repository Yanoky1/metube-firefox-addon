async function getCurrentUrl() {
  let tabs = await browser.tabs.query({ currentWindow: true, active: true });
  return tabs[0].url;
}

async function getDefaultDownloadType() {
  let item = await browser.storage.sync.get("defaultDownloadType");
  return item.defaultDownloadType ?? 'video';
}

async function getDefaultCodec() {
  let item = await browser.storage.sync.get("defaultCodec");
  return item.defaultCodec ?? 'auto';
}

async function getDefaultSubtitleLanguage() {
  let item = await browser.storage.sync.get("defaultSubtitleLanguage");
  return item.defaultSubtitleLanguage ?? 'en';
}

async function getDefaultSubtitleMode() {
  let item = await browser.storage.sync.get("defaultSubtitleMode");
  return item.defaultSubtitleMode ?? 'prefer_manual';
}

async function getDefaultQuality() {
  let item = await browser.storage.sync.get("defaultQuality");
  return item.defaultQuality ?? 'best';
}

async function getDefaultFormat() {
  let item = await browser.storage.sync.get("defaultFormat");
  return item.defaultFormat ?? 'any';
}

async function getDefaultFolder() {
  let item = await browser.storage.sync.get("defaultFolder");
  return item.defaultFolder ?? '';
}

async function getDefaultCustomNamePrefix() {
  let item = await browser.storage.sync.get("defaultCustomNamePrefix");
  return item.defaultCustomNamePrefix ?? '';
}

async function getDefaultAutoStart() {
  let item = await browser.storage.sync.get("defaultAutoStart");
  return item.defaultAutoStart ?? true;
}

async function getDefaultStrictPlaylistMode() {
  let item = await browser.storage.sync.get("strictPlaylistMode");
  return item.strictPlaylistMode ?? false;
}

const UNSAFE_PATH_CHARS = /[\/\\:*?"<>|]/g;

// Security: substituted values come from the page URL, so they must never be
// able to inject path separators or ".." traversal into the MeTube folder.
function sanitizeVariableValue(value) {
  return value
    .replace(UNSAFE_PATH_CHARS, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\s]+|[.\s]+$/g, '');
}

function buildTemplateVariables(itemUrl) {
  let hostname = '';
  try {
    hostname = new URL(itemUrl).hostname;
  } catch (error) {
    // Non-standard URLs (about:, file:, malformed input) have no hostname.
    hostname = '';
  }

  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const year = String(now.getFullYear());
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());

return {
    HOSTNAME: hostname.replace(/\./g, '_'),
    DOMAIN: (hostname.startsWith('www.') ? hostname.slice(4) : hostname)
        .replace(/\./g, '_'),
    DATE: `${year}-${month}-${day}`,
    YEAR: year,
    MONTH: month,
    DAY: day,
};
}

// "videos/%DOMAIN%/clips" -> "videos/clips" when %DOMAIN% resolves to nothing.
function collapsePathSeparators(value) {
  return value.replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
}

// Unknown tokens are left untouched on purpose: typos stay visible, and
// pre-existing values containing '%' keep working unchanged.
function resolveTemplateVariables(template, itemUrl) {
  if (!template || !template.includes('%')) {
    return template;
  }

  const variables = buildTemplateVariables(itemUrl);
  let substituted = false;
  const resolved = template.replace(/%([A-Z_]+)%/g, (token, name) => {
    if (!(name in variables)) {
      return token;
    }
    substituted = true;
    return sanitizeVariableValue(variables[name]);
  });

  return substituted ? collapsePathSeparators(resolved) : template;
}

async function requestPermissionsForUrl(url, useCookieAuth) {
  try {
    const permissionRequest = {};

    if (useCookieAuth) {
      // For SSO, request <all_urls> to handle authentication redirects
      permissionRequest.origins = ["<all_urls>"];
      permissionRequest.permissions = ["cookies"];
    } else {
      // Without SSO, only request specific domain
      const urlObj = new URL(url);
      const origin = `${urlObj.protocol}//${urlObj.host}/*`;
      permissionRequest.origins = [origin];
    }

    return await browser.permissions.request(permissionRequest);
  } catch (error) {
    console.error("Error requesting permission:", error);
    return false;
  }
}

async function getYtdlOptionsForUrl(itemUrl) {
  try {
    const { domainYtdlOptions = [] } =
      await browser.storage.sync.get("domainYtdlOptions");

    const hostname = new URL(itemUrl).hostname.toLowerCase();

    const sortedRules = [...domainYtdlOptions].sort(
      (a, b) => b.domain.length - a.domain.length
    );

    for (const rule of sortedRules) {
      const domain = rule.domain
        .trim()
        .toLowerCase()
        .replace(/^\*\./, "");

      if (
        hostname === domain ||
        hostname.endsWith("." + domain)
      ) {
        return {
          options: rule.options || {},
          folder: rule.folder || ""
        };
      }
    }

    return {
      options: {},
      folder: ""
    };

  } catch (error) {
    console.error("Failed to resolve yt-dlp options:", error);

    return {
      options: {},
      folder: ""
    };
  }
}

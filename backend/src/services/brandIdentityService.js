function stripTags(html = '') {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractMetaContent(html = '', name) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1].trim();
  }

  return '';
}

export function extractBrandIdentityFromHtml({ url = '', html = '' }) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const description = extractMetaContent(html, 'description') || extractMetaContent(html, 'og:description');
  const ogTitle = extractMetaContent(html, 'og:title');
  const bodyText = stripTags(html).slice(0, 1200);

  return {
    url,
    title: ogTitle || title || '',
    description,
    bodyText,
  };
}

export async function fetchBrandIdentity(url) {
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MVOE-Grant-Writer/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch brand URL: ${response.status}`);
  }

  const html = await response.text();
  return extractBrandIdentityFromHtml({ url, html });
}

export async function buildBrandIdentityProfile(request = {}) {
  const websiteProfile = request.websiteUrl ? await fetchBrandIdentity(request.websiteUrl) : null;

  return {
    organizationName: request.organizationName || '',
    mission: request.mission || '',
    location: request.location || '',
    populationServed: request.populationServed || '',
    socialUrl: request.socialUrl || '',
    websiteProfile,
  };
}

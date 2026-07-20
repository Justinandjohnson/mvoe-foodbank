import ChromeDevToolsClient from '../mcp/chromeDevToolsClient.js';
import { identifyGrantPortal } from './grantPortalAdapters.js';

function summarizeSnapshot(snapshotText = '') {
  return snapshotText.replace(/\s+/g, ' ').trim().slice(0, 1200);
}

export async function inspectGrantPortal(applicationUrl) {
  const portal = identifyGrantPortal(applicationUrl);
  const client = new ChromeDevToolsClient();

  try {
    const navigateResult = await client.navigate(applicationUrl);
    if (!navigateResult.success) {
      return {
        ...portal,
        applicationUrl,
        liveInspection: false,
        portalSummary: portal.notes,
      };
    }

    const snapshot = await client.takeSnapshot();
    const snapshotText = snapshot?.data?.[0]?.text || '';
    const portalSummary = summarizeSnapshot(snapshotText) || portal.notes;
    const uploadLikely = /upload|attachment|document|pdf/i.test(portalSummary);
    const loginLikely = /login|sign in|account/i.test(portalSummary);

    return {
      ...portal,
      applicationUrl,
      liveInspection: true,
      portalSummary,
      uploadLikely,
      loginLikely,
    };
  } catch (error) {
    return {
      ...portal,
      applicationUrl,
      liveInspection: false,
      portalSummary: `${portal.notes} Inspection error: ${error.message}`,
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

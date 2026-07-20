export const SUPPORTED_GRANT_PORTALS = {
  'grants.gov': {
    portalType: 'grants.gov',
    strategy: 'supported-portal',
    notes: 'Federal workflow with registration/compliance prerequisites and portal-specific attachments.',
  },
  'submittable.com': {
    portalType: 'submittable',
    strategy: 'supported-portal',
    notes: 'Hosted grant application workflow with multi-step web forms and uploads.',
  },
  'fluxx.io': {
    portalType: 'fluxx',
    strategy: 'supported-portal',
    notes: 'Grant management portal with account/login gating and structured application steps.',
  },
  'smartsimple.com': {
    portalType: 'smartsimple',
    strategy: 'supported-portal',
    notes: 'Foundation portal with custom web forms and upload requirements.',
  },
};

export function identifyGrantPortal(url = '') {
  const normalized = url.toLowerCase();
  const matchedDomain = Object.keys(SUPPORTED_GRANT_PORTALS).find((domain) => normalized.includes(domain));

  if (matchedDomain) {
    return {
      ...SUPPORTED_GRANT_PORTALS[matchedDomain],
      matchedDomain,
    };
  }

  if (normalized.endsWith('.pdf') || normalized.includes('.pdf?')) {
    return {
      portalType: 'downloadable-form',
      strategy: 'document-first',
      notes: 'Download, fill, and upload workflow is likely safer than direct browser typing.',
    };
  }

  return {
    portalType: 'generic-web-form',
    strategy: 'best-effort-browser',
    notes: 'Use browser automation for discovery and field extraction, then pause before submit.',
  };
}

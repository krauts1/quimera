export const AXIE_CANONICAL_ASSET_PREFIX = '/assets/axie/' as const;
export const AXIE_PINNED_SOURCE_COMMIT = 'public-content-v1' as const;

export interface AxieAssetLocatorOptions {
  /** Directory containing manifest.json; may be root-relative, relative, or absolute. */
  readonly assetBaseUrl?: string;
  /** Optional final resolver for signed URLs, CDNs, or application-specific routing. */
  readonly resolveAssetUrl?: (url: string) => string;
}

export interface AxieAssetLocator {
  readonly baseUrl: string;
  readonly manifestUrl: string;
  resolve(url: string, baseUrl?: string): string;
}

function directoryUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new TypeError('Axie assetBaseUrl cannot be empty.');
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function createAxieAssetLocator(options: AxieAssetLocatorOptions = {}): AxieAssetLocator {
  const baseUrl = directoryUrl(options.assetBaseUrl ?? AXIE_CANONICAL_ASSET_PREFIX);
  const resolve = (url: string, parentUrl?: string) => {
    let candidate = url;
    if (parentUrl && !url.startsWith('/') && !/^[a-z][a-z\d+.-]*:/iu.test(url)) {
      try {
        candidate = new URL(url, parentUrl).toString();
      } catch {
        const slash = parentUrl.lastIndexOf('/');
        candidate = slash >= 0 ? `${parentUrl.slice(0, slash + 1)}${url}` : url;
      }
    }
    const relocated = candidate.startsWith(AXIE_CANONICAL_ASSET_PREFIX)
      ? `${baseUrl}${candidate.slice(AXIE_CANONICAL_ASSET_PREFIX.length)}`
      : candidate;
    return options.resolveAssetUrl?.(relocated) ?? relocated;
  };
  return Object.freeze({
    baseUrl,
    manifestUrl: resolve(`${AXIE_CANONICAL_ASSET_PREFIX}manifest.json`),
    resolve,
  });
}

import { blogUrl } from './site.mjs';

export type BackgroundSource =
  | { kind: 'asset'; src: string }
  | { kind: 'image'; url: string }
  | { kind: 'json'; url: string; imagePath: string };

export interface BackgroundConfig {
  source: BackgroundSource;
  position: string;
}

/** Local asset paths are relative to components/blog/public/. */
export const background: BackgroundConfig = {
  // source: { kind: 'asset', src: 'backgrounds/aurora.svg' },
  source: { kind: 'image', url: 'https://uapis.cn/api/v1/random/image' },
  position: '50% 50%',
};

export const fallbackBackground = blogUrl('backgrounds/aurora.svg');
export const themeStorageKey = 'blog-appearance-theme';

export function assetUrl(src: string): string {
  return blogUrl(src.replace(/^\/+/, ''));
}

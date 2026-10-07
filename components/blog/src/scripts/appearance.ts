import { componentUrl } from '@site/config';
import type { TransitionBeforeSwapEvent } from 'astro:transitions/client';
import { themeStorageKey, type BackgroundConfig } from '../config/appearance';

type Theme = 'light' | 'dark';
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let preference: Theme | undefined;
try {
  const stored = localStorage.getItem(themeStorageKey);
  if (stored === 'light' || stored === 'dark') preference = stored;
} catch {
  /* A private browsing session can still keep an in-memory choice. */
}

function applyTheme(doc: Document = document) {
  const theme = preference ?? (systemTheme.matches ? 'dark' : 'light');
  doc.documentElement.dataset.theme = theme;
  doc
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#141d30' : '#e3eaf5');
  const button = doc.querySelector<HTMLButtonElement>('.theme-toggle');
  if (button) {
    button.hidden = false;
    button.setAttribute(
      'aria-label',
      `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`,
    );
    button.title = button.getAttribute('aria-label')!;
  }
}

document.addEventListener('click', (event) => {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest('.theme-toggle')
  )
    return;
  preference =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(themeStorageKey, preference);
  } catch {
    /* Keep the in-memory preference. */
  }
  applyTheme();
});
systemTheme.addEventListener('change', () => {
  if (!preference) applyTheme();
});
window.addEventListener('storage', (event) => {
  if (event.key !== themeStorageKey && event.key !== null) return;
  preference =
    event.newValue === 'light' || event.newValue === 'dark'
      ? event.newValue
      : undefined;
  applyTheme();
});
document.addEventListener(
  'astro:before-swap',
  (event: TransitionBeforeSwapEvent) => {
    applyTheme(event.newDocument);
    event.newDocument.documentElement.dataset.themeReady = '';
  },
);

function imageUrl(value: unknown, base: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Missing image URL');
  const url = new URL(value, base);
  if (!['https:', 'http:'].includes(url.protocol))
    throw new Error('Unsupported image URL');
  return url.href;
}

async function loadBackground() {
  const wallpaper = document.querySelector<HTMLElement>('[data-background]');
  if (!wallpaper || wallpaper.dataset.state) return;
  wallpaper.dataset.state = 'loading';
  const base = wallpaper.querySelector<HTMLImageElement>('.wallpaper-base')!;
  const target = wallpaper.querySelector<HTMLImageElement>('.wallpaper-image')!;
  const fallback = wallpaper.dataset.fallback!;
  const restoreLocal = () => {
    if (base.getAttribute('src') !== fallback) base.src = fallback;
  };
  base.addEventListener('error', restoreLocal);
  if (base.complete && !base.naturalWidth) restoreLocal();
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const config: BackgroundConfig = JSON.parse(wallpaper.dataset.background!);
    if (config.source.kind === 'asset') {
      wallpaper.dataset.state = 'ready';
      return;
    }
    const source = config.source;
    const timeout = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => {
        controller.abort();
        reject(new Error('Background loading deadline exceeded'));
      }, 8000);
    });
    const load = async () => {
      let url: string;
      if (source.kind === 'json') {
        const endpoint = imageUrl(source.url, location.href);
        const response = await fetch(endpoint, {
          signal: controller.signal,
          credentials: 'omit',
        });
        if (!response.ok) throw new Error('Image API failed');
        let value: unknown = await response.json();
        for (const key of source.imagePath.split('.')) {
          if (
            !key ||
            !value ||
            typeof value !== 'object' ||
            !Object.hasOwn(value, key)
          )
            throw new Error('Missing image field');
          value = (value as Record<string, unknown>)[key];
        }
        url = imageUrl(value, response.url || endpoint);
      } else {
        url = imageUrl(source.url, location.href);
      }
      if (controller.signal.aborted)
        throw new Error('Background request cancelled');
      target.src = url;
      await target.decode();
    };
    await Promise.race([load(), timeout]);
    target.classList.add('is-loaded');
    wallpaper.dataset.state = 'ready';
  } catch {
    controller.abort();
    target.removeAttribute('src');
    wallpaper.dataset.state = 'fallback';
  } finally {
    if (deadline) clearTimeout(deadline);
  }
}

const header = document.querySelector<HTMLElement>('.site-header');
let pageController: AbortController | undefined;
function initializePage() {
  applyTheme();
  requestAnimationFrame(() => {
    document.documentElement.dataset.themeReady = '';
  });
  const tagsActive = location.pathname.startsWith(componentUrl('blog', 'tags'));
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((link) => {
    if ((link.dataset.nav === 'tags') === tagsActive)
      link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  pageController?.abort();
  pageController = new AbortController();
  const headings = [
    ...document.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id]'),
  ];
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc a')];
  let frame = 0;
  let current = '';
  const update = () => {
    frame = 0;
    const offset = (header?.getBoundingClientRect().bottom ?? 0) + 64;
    const active = headings
      .filter((heading) => heading.getBoundingClientRect().top <= offset)
      .at(-1);
    const id = active?.id ?? '';
    if (current === id) return;
    current = id;
    links.forEach((link) => {
      if (decodeURIComponent(link.hash.slice(1)) === id)
        link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  if (headings.length) {
    window.addEventListener('scroll', schedule, {
      passive: true,
      signal: pageController.signal,
    });
    window.addEventListener('resize', schedule, {
      passive: true,
      signal: pageController.signal,
    });
    pageController.signal.addEventListener(
      'abort',
      () => cancelAnimationFrame(frame),
      { once: true },
    );
    update();
  }
}

document.addEventListener('astro:after-swap', () => {
  applyTheme();
});
document.addEventListener('astro:page-load', initializePage);
void loadBackground();

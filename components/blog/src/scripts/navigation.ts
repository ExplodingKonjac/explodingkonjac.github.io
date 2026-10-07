import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from 'astro:transitions/client';

// Only the decorative surface is shared: text belongs to the fading page snapshot.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const origins = new Map<
  string,
  { post: string; width: number; height: number }
>();
let keyboard = false;
let sequence = 0;
let active:
  | {
      id: number;
      mode: 'open' | 'close' | 'fade';
      post?: string;
      keyboard: boolean;
      traversal: boolean;
      hash: string;
    }
  | undefined;

document.addEventListener(
  'keydown',
  () => {
    keyboard = true;
  },
  { capture: true },
);
document.addEventListener(
  'pointerdown',
  () => {
    keyboard = false;
  },
  { capture: true, passive: true },
);

function clearNames(includeRegions = true) {
  document
    .querySelectorAll<HTMLElement>(
      includeRegions
        ? '[data-shared-surface], [data-motion-region]'
        : '[data-shared-surface]',
    )
    .forEach((surface) => {
      surface.style.removeProperty('view-transition-name');
      delete surface.dataset.sharedSurface;
      delete surface.dataset.motionRegion;
    });
  delete document.documentElement.dataset.motion;
}
// Separate snapshot names preserve the original geometry, including clipped
// portions of long articles. Only the selected decorative surface is paired.
function nameRegions(doc: Document, phase: 'in' | 'out') {
  for (const [selector, name] of [
    ['.page-stage', 'page'],
    ['.reading-card', 'article-body'],
    ['.toc', 'article-toc'],
  ]) {
    const element = doc.querySelector<HTMLElement>(selector);
    if (!element) continue;
    element.style.viewTransitionName = `${name}-${phase}`;
    element.dataset.motionRegion = '';
  }
}
function cardFor(doc: Document, post: string) {
  return [...doc.querySelectorAll<HTMLElement>('[data-post-key]')].find(
    (card) => card.dataset.postKey === post,
  );
}
function visible(card: HTMLElement) {
  const rect = card.getBoundingClientRect();
  const headerBottom =
    document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
  return (
    rect.width > 0 &&
    rect.top >= headerBottom + 8 &&
    rect.bottom <= innerHeight &&
    rect.left >= 0 &&
    rect.right <= innerWidth
  );
}
function nameSurface(card: HTMLElement) {
  const surface = card.querySelector<HTMLElement>(':scope > .glass-surface');
  if (surface) {
    surface.style.viewTransitionName = 'post-surface';
    surface.dataset.sharedSurface = '';
  }
}

// Wrapping the loader gives us both documents before the outgoing snapshot.
// before-swap alone is too late to name the outgoing card.
document.addEventListener(
  'astro:before-preparation',
  (event: TransitionBeforePreparationEvent) => {
    if (
      event.from.pathname === event.to.pathname &&
      event.from.search === event.to.search
    )
      return;
    clearNames();
    const id = ++sequence;
    const state: NonNullable<typeof active> = {
      id,
      mode: 'fade',
      keyboard,
      traversal: event.navigationType === 'traverse',
      hash: event.to.hash,
    };
    active = state;
    document.documentElement.dataset.motion = 'fade';
    const loader = event.loader;
    event.loader = async () => {
      await loader();
      if (event.signal.aborted || id !== sequence) return;
      const next = event.newDocument;
      nameRegions(document, 'out');
      nameRegions(next, 'in');
      const oldPost = document.querySelector<HTMLElement>(
        '.article-heading[data-post-key]',
      );
      const newPost = next.querySelector<HTMLElement>(
        '.article-heading[data-post-key]',
      );
      let from: HTMLElement | undefined;
      let to: HTMLElement | undefined;
      if (newPost && !oldPost) {
        const post = newPost.dataset.postKey!;
        from = cardFor(document, post);
        to = newPost;
        state.post = post;
        state.mode = 'open';
        if (!state.traversal && from) {
          origins.set(`${history.state?.index}:${event.from.href}`, {
            post,
            width: innerWidth,
            height: innerHeight,
          });
          // Keep only recent entries; history and scrolling remain Astro's responsibility.
          if (origins.size > 40) origins.delete(origins.keys().next().value!);
        }
      } else if (oldPost && !newPost && state.traversal) {
        const origin = origins.get(`${history.state?.index}:${event.to.href}`);
        if (
          origin &&
          origin.post === oldPost.dataset.postKey &&
          origin.width === innerWidth &&
          origin.height === innerHeight
        ) {
          from = oldPost;
          to = cardFor(next, origin.post);
          state.post = origin.post;
          state.mode = 'close';
        }
      }
      if (
        reducedMotion.matches ||
        !document.startViewTransition ||
        event.to.hash ||
        !from ||
        !to ||
        !visible(from)
      ) {
        state.mode = 'fade';
      } else {
        nameSurface(from);
        nameSurface(to);
      }
      document.documentElement.dataset.motion = state.mode;
      next.documentElement.dataset.motion = state.mode;
    };
    event.signal.addEventListener(
      'abort',
      () => {
        if (active?.id === id) {
          clearNames();
          active = undefined;
        }
      },
      { once: true },
    );
  },
);

document.addEventListener(
  'astro:before-swap',
  (event: TransitionBeforeSwapEvent) => {
    const state = active;
    if (!state) return;
    void event.viewTransition.finished
      .finally(() => {
        if (active?.id === state.id) {
          clearNames();
          active = undefined;
        }
      })
      .catch(() => {
        /* A superseding navigation may skip the transition. */
      });
  },
);

document.addEventListener('astro:after-swap', () => {
  // Astro has restored the destination scroll position before this event.
  if (!active || active.mode === 'fade' || !active.post) return;
  const target = cardFor(document, active.post);
  if (!target || !visible(target)) {
    active.mode = 'fade';
    clearNames(false);
    document.documentElement.dataset.motion = 'fade';
  }
});

document.addEventListener('astro:page-load', () => {
  const state = active;
  if (!state || state.hash) return;
  if (state.traversal && state.post) {
    cardFor(document, state.post)
      ?.querySelector<HTMLAnchorElement>('.post-link')
      ?.focus({ preventScroll: true });
  } else if (state.keyboard) {
    const heading = document.querySelector<HTMLElement>('main h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }
});

// This module executes once; subsequent entrances use the router choreography.
if (!reducedMotion.matches) {
  document.querySelector('main')?.animate(
    [
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
}

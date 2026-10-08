import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from 'astro:transitions/client';
import { prepareGlass } from './glass';
import { prepareSearch } from './search-ui';
import {
  reduced,
  cardFor,
  visible,
  layers,
  revealCard,
  revealText,
  clean,
  type Navigation,
} from './navigation-motion';
import { launchFlight, moveFlight } from './navigation-flight';

let initialized = false;
export function initializeNavigation() {
  if (initialized) return;
  initialized = true;
  let keyboard = false;
  let active: Navigation | undefined;
  let pendingFocus: Navigation | undefined;
  const trackInput = (event: Event) => {
    keyboard = event.type === 'keydown';
    pendingFocus = undefined;
  };
  document.addEventListener('keydown', trackInput, { capture: true });
  document.addEventListener('pointerdown', trackInput, {
    capture: true,
    passive: true,
  });
  document.addEventListener('focusin', () => {
    // An explicit focus change after route load takes precedence over the delayed
    // heading handoff, including interaction with the persistent navigation bar.
    if (pendingFocus?.pageLoaded) pendingFocus = undefined;
  });
  document.addEventListener('blog:language-change', () => {
    // Translated labels and dates can resize a panel. Hand off the current motion
    // before measuring the new language so the glass never lands at stale bounds.
    active?.animations.forEach((animation) => animation.finish());
    prepareGlass();
  });

  document.addEventListener(
    'astro:before-preparation',
    (event: TransitionBeforePreparationEvent) => {
      if (
        event.from.pathname === event.to.pathname &&
        event.from.search === event.to.search
      )
        return;
      if (active) clean(active);
      pendingFocus = undefined;
      const state: Navigation = {
        mode: 'reveal',
        keyboard,
        traversal: event.navigationType === 'traverse',
        hash: event.to.hash,
        animations: [],
        cards: new Map(),
        content: [],
      };
      active = state;
      document.documentElement.dataset.motion = 'loading';
      const loader = event.loader;
      event.loader = async () => {
        await loader();
        if (event.signal.aborted || active !== state || event.defaultPrevented)
          return;
        const next = event.newDocument;
        const oldPost = document.querySelector<HTMLElement>(
          '.article-heading[data-post-key]',
        );
        const newPost = next.querySelector<HTMLElement>(
          '.article-heading[data-post-key]',
        );
        const oldTag = document.querySelector<HTMLElement>(
          '.tag-heading[data-tag-key]',
        );
        const newTag = next.querySelector<HTMLElement>(
          '.tag-heading[data-tag-key]',
        );
        // Prefer a post pair when moving between a filtered list and an article.
        const kind = oldPost || newPost ? 'post' : 'tag';
        const oldHeading = kind === 'post' ? oldPost : oldTag;
        const newHeading = kind === 'post' ? newPost : newTag;
        const key = (newHeading ?? oldHeading)?.getAttribute(
          `data-${kind}-key`,
        );
        if (key) state.item = { kind, key };
        const source = state.item ? cardFor(document, state.item) : undefined;
        const destination = state.item ? cardFor(next, state.item) : undefined;
        if (
          !reduced.matches &&
          !event.to.hash &&
          source &&
          destination &&
          visible(source) &&
          !!oldHeading !== !!newHeading
        ) {
          state.mode = newHeading ? 'open' : 'close';
          launchFlight(state, source);
        }
        document.documentElement.dataset.motion = state.mode;
        layers(document);
        const incoming = layers(next);
        next.documentElement.dataset.motion = state.mode;
        if (!reduced.matches) next.documentElement.dataset.entering = '';
        // Retract content from bottom to top while the glass closes. A participating
        // shared surface stays intact in the flight layer until the document swap.
        if (!reduced.matches)
          await Promise.all(
            [
              ...document.querySelectorAll<HTMLElement>('.page-stage .glass'),
            ].flatMap((card) => revealCard(state, card, false)),
          );
        if (active !== state || event.signal.aborted) return;
        if (!incoming.length) delete next.documentElement.dataset.entering;
      };
      event.signal.addEventListener(
        'abort',
        () => {
          if (pendingFocus === state) pendingFocus = undefined;
          if (active === state) {
            clean(state);
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
      prepareSearch(event.newDocument, event.to);
      // Astro still owns fetch, history and scrolling. Its bitmap animation is skipped
      // because it cannot preserve a live backdrop-filter material across snapshots.
      void event.viewTransition.ready.catch(() => {});
      event.viewTransition.skipTransition();
    },
  );

  document.addEventListener('astro:after-swap', async () => {
    const state = active;
    if (!state) {
      prepareGlass();
      return;
    }
    prepareGlass();
    pendingFocus = state;
    const target = state.item ? cardFor(document, state.item) : undefined;
    const moving = !!state.flight && !!target && visible(target);
    const travel = 420;
    const jobs: Promise<unknown>[] = [];
    if (moving && state.flight && target) {
      jobs.push(...moveFlight(state, target, travel));
    } else if (state.flight) {
      jobs.push(...revealCard(state, state.flight, false));
      state.mode = 'reveal';
      document.documentElement.dataset.motion = 'reveal';
    }
    layers(document);
    const cards = [
      ...document.querySelectorAll<HTMLElement>('.page-stage .glass'),
    ];
    for (const [index, card] of cards.entries()) {
      if (reduced.matches) continue;
      if (moving && card === target) {
        if (!state.cards.has(card)) state.cards.set(card, card.inert);
        card.inert = true;
        // The shared panel already exists. Only its new, unpaired content streams in.
        for (const child of card.children) {
          if (
            !(child instanceof HTMLElement) ||
            child.hasAttribute('data-flight-target')
          )
            continue;
          jobs.push(revealText(state, child, true, 240, 300));
        }
        continue;
      }
      let delay = moving ? 300 : Math.min(index * 32, 96);
      if (moving && card.classList.contains('reading-card')) delay = 330;
      if (moving && card.classList.contains('toc')) delay = 370;
      jobs.push(...revealCard(state, card, true, delay));
    }
    await Promise.all(jobs);
    if (active !== state) return;
    clean(state);
    state.motionFinished = true;
    // Focus follows both route completion and the handoff from the hidden real label.
    if (pendingFocus === state && state.pageLoaded) {
      focusDestination(state);
      pendingFocus = undefined;
    }
    active = undefined;
  });

  function focusDestination(state: Navigation) {
    if (state.hash) return;
    if (state.traversal && state.item) {
      const card = cardFor(document, state.item);
      const link =
        card instanceof HTMLAnchorElement
          ? card
          : card?.querySelector<HTMLAnchorElement>('.post-link');
      if (link) {
        link.focus({ preventScroll: true });
        return;
      }
    }
    if (state.keyboard) {
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  }
  document.addEventListener('astro:page-load', () => {
    const state = pendingFocus;
    if (!state) return;
    state.pageLoaded = true;
    if (state.motionFinished) {
      focusDestination(state);
      pendingFocus = undefined;
    }
  });
}

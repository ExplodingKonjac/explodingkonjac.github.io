import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from 'astro:transitions/client';
import { prepareGlass } from './glass';

// Animate live material independently of text. Fading a parent of backdrop-filter
// creates a new backdrop root; page snapshots also lose the live refracted scene.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
let keyboard = false;
let sequence = 0;
type Item = { kind: 'post' | 'tag'; key: string };
type ContentFlight = {
  source: HTMLElement;
  node: HTMLElement;
  selector: string;
};
type Navigation = {
  id: number;
  mode: 'open' | 'close' | 'fade';
  item?: Item;
  keyboard: boolean;
  traversal: boolean;
  hash: string;
  animations: Animation[];
  flight?: HTMLElement;
  source?: HTMLElement;
  sourceLabel?: HTMLElement;
  flightLabel?: HTMLElement;
  content: ContentFlight[];
  pageLoaded?: boolean;
  motionFinished?: boolean;
};
let active: Navigation | undefined;
let pendingFocus: Navigation | undefined;
document.addEventListener(
  'keydown',
  () => {
    keyboard = true;
    pendingFocus = undefined;
  },
  { capture: true },
);
document.addEventListener(
  'pointerdown',
  () => {
    keyboard = false;
    pendingFocus = undefined;
  },
  { capture: true, passive: true },
);

function cardFor(doc: Document, item: Item) {
  const attribute = `data-${item.kind}-key`;
  return [...doc.querySelectorAll<HTMLElement>(`[${attribute}]`)].find(
    (card) => card.getAttribute(attribute) === item.key,
  );
}
function visible(card: HTMLElement) {
  const rect = card.getBoundingClientRect();
  const bottom = document
    .querySelector('.site-header')!
    .getBoundingClientRect().bottom;
  return rect.top >= bottom + 8 && rect.bottom <= innerHeight && rect.width > 0;
}
function layers(doc: Document) {
  const result: HTMLElement[] = [];
  doc.querySelectorAll('.page-stage .glass').forEach((card) => {
    for (const child of card.children) {
      if (child instanceof HTMLElement) {
        child.dataset.navLayer = child.classList.contains('glass-surface')
          ? 'surface'
          : 'text';
        result.push(child);
      }
    }
  });
  return result;
}
async function animate(
  state: Navigation,
  element: HTMLElement,
  frames: Keyframe[],
  duration: number,
  delay = 0,
) {
  if (element.closest('.glass-flight')) {
    // Keep fixed typography in the inline style. WebKit can skip position updates
    // when the same effect redundantly animates an unchanged font size.
    const fixedType = [
      'fontSize',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
    ].filter((property) =>
      frames.every((frame) => frame[property] === frames[0][property]),
    );
    frames = frames.map((frame) =>
      Object.fromEntries(
        Object.entries(frame).filter(
          ([property]) => !fixedType.includes(property),
        ),
      ),
    );
  }
  const animation = element.animate(frames, {
    duration: reduced.matches ? 0 : duration,
    delay: reduced.matches ? 0 : delay,
    easing: frames.at(-1)?.opacity === 0 ? 'ease-in-out' : easing,
    fill: 'both',
  });
  state.animations.push(animation);
  await animation.finished.catch(() => {});
}
function clean(state: Navigation) {
  state.animations.forEach((animation) => animation.cancel());
  state.flight?.remove();
  state.source?.style.removeProperty('visibility');
  state.sourceLabel?.style.removeProperty('visibility');
  state.content.forEach(({ source }) =>
    source.style.removeProperty('visibility'),
  );
  document
    .querySelectorAll<HTMLElement>('[data-nav-layer], [data-flight-target]')
    .forEach((element) => {
      delete element.dataset.navLayer;
      delete element.dataset.flightTarget;
    });
  delete document.documentElement.dataset.entering;
  delete document.documentElement.dataset.motion;
  prepareGlass();
}
function labelFrame(label: HTMLElement, card: HTMLElement): Keyframe {
  const box = label.getBoundingClientRect();
  const parent = card.getBoundingClientRect();
  const style = getComputedStyle(label);
  return {
    left: `${box.left - parent.left}px`,
    top: `${box.top - parent.top}px`,
    width: `${box.width}px`,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    // Normalize equivalent spacing before comparing typography keyframes.
    letterSpacing:
      style.letterSpacing === 'normal' ? '0px' : style.letterSpacing,
    lineHeight: style.lineHeight,
  };
}
function singleLine(label: HTMLElement) {
  return (
    label.getBoundingClientRect().height <=
    parseFloat(getComputedStyle(label).lineHeight) * 1.5
  );
}
function titleSelector(state: Navigation) {
  return state.item?.kind === 'tag' ? '[data-tag-label]' : '[data-post-title]';
}
function flightText(source: HTMLElement) {
  return source.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
function moveContent(
  state: Navigation,
  node: HTMLElement,
  target: HTMLElement,
  card: HTMLElement,
  duration: number,
  fixedLayout = false,
) {
  const from = labelFrame(node, state.flight!);
  const to = labelFrame(target, card);
  target.dataset.flightTarget = '';
  if (fixedLayout || (singleLine(node) && singleLine(target)))
    return [animate(state, node, [from, to], duration)];

  // Each wrapped layout keeps its own typography and line breaks while both
  // follow the same path. Their short, staggered crossfade avoids colliding text.
  const incoming = node.cloneNode(true) as HTMLElement;
  incoming.dataset.flightCopy = 'destination';
  Object.assign(incoming.style, to);
  state.flight!.append(incoming);
  return [
    animate(
      state,
      node,
      [from, { ...from, left: to.left, top: to.top }],
      duration,
    ),
    animate(state, node, [{ opacity: 1 }, { opacity: 0 }], 160),
    animate(
      state,
      incoming,
      [{ ...to, left: from.left, top: from.top }, to],
      duration,
    ),
    animate(state, incoming, [{ opacity: 0 }, { opacity: 1 }], 220, 140),
  ];
}
function launchFlight(state: Navigation, card: HTMLElement) {
  const original = card.querySelector<HTMLElement>(':scope > .glass-surface')!;
  const box = card.getBoundingClientRect();
  const flight = document.createElement('div');
  flight.className = 'glass glass-flight';
  flight.inert = true;
  Object.assign(flight.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    borderRadius: getComputedStyle(card).borderRadius,
  });
  const surface = original.cloneNode(true) as HTMLElement;
  surface.removeAttribute('style');
  surface.removeAttribute('data-nav-layer');
  flight.append(surface);
  if (state.item) {
    const originalLabel = card.querySelector<HTMLElement>(
      titleSelector(state),
    )!;
    const label = document.createElement('div');
    label.className = 'glass-flight-label';
    label.dataset.flightCopy = 'source';
    label.textContent =
      state.item.kind === 'tag' ? state.item.key : flightText(originalLabel);
    Object.assign(label.style, labelFrame(originalLabel, card));
    if (state.item.kind === 'tag') {
      const period = document.createElement('span');
      period.className = 'glass-flight-period';
      period.textContent = '.';
      period.style.opacity = state.mode === 'open' ? '0' : '1';
      label.append(period);
    }
    flight.append(label);
    state.flightLabel = label;
    state.sourceLabel = originalLabel;
    originalLabel.style.visibility = 'hidden';
  }
  if (state.item?.kind === 'post') {
    for (const selector of ['[data-post-description]', '.tags']) {
      const source = card.querySelector<HTMLElement>(selector);
      if (!source) continue;
      const node = source.cloneNode(true) as HTMLElement;
      node.classList.add('glass-flight-content');
      if (selector === '[data-post-description]')
        node.classList.add('glass-flight-description');
      node.dataset.flightCopy = 'source';
      Object.assign(node.style, labelFrame(source, card));
      flight.append(node);
      state.content.push({ source, node, selector });
      source.style.visibility = 'hidden';
    }
  }
  document.querySelector('#glass-flight-layer')!.append(flight);
  state.flight = flight;
  state.source = original;
  prepareGlass(flight);
  original.style.visibility = 'hidden';
}

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
      id: ++sequence,
      mode: 'fade',
      keyboard,
      traversal: event.navigationType === 'traverse',
      hash: event.to.hash,
      animations: [],
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
      const key = (newHeading ?? oldHeading)?.getAttribute(`data-${kind}-key`);
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
      const outgoing = layers(document);
      const incoming = layers(next);
      next.documentElement.dataset.motion = state.mode;
      if (!reduced.matches) next.documentElement.dataset.entering = '';
      // A visible, deliberate exit occurs before swapping HTML, including Blog and
      // wordmark clicks (not only browser history). The material is never snapped.
      if (!reduced.matches)
        await Promise.all(
          outgoing.map((element) =>
            animate(state, element, [{ opacity: 1 }, { opacity: 0 }], 220),
          ),
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
  const tagFlight = state.item?.kind === 'tag' && moving;
  const travel = 420;
  const jobs: Promise<unknown>[] = [];
  if (moving && state.flight && target) {
    const rect = target.getBoundingClientRect();
    const surface = target.querySelector<HTMLElement>(
      ':scope > .glass-surface',
    )!;
    surface.dataset.flightTarget = '';
    const from = state.flight.getBoundingClientRect();
    jobs.push(
      animate(
        state,
        state.flight,
        [
          {
            left: `${from.left}px`,
            top: `${from.top}px`,
            width: `${from.width}px`,
            height: `${from.height}px`,
            borderRadius: state.flight.style.borderRadius,
          },
          {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            borderRadius: getComputedStyle(target).borderRadius,
          },
        ],
        travel,
      ),
    );
    if (state.flightLabel) {
      const label = state.flightLabel;
      const targetLabel = target.querySelector<HTMLElement>(
        titleSelector(state),
      )!;
      const period = label.querySelector<HTMLElement>('.glass-flight-period');
      if (state.item?.kind === 'post') {
        jobs.push(...moveContent(state, label, targetLabel, target, travel));
      } else if (singleLine(label) && singleLine(targetLabel)) {
        targetLabel.dataset.flightTarget = '';
        // Typography is re-rendered at its current size, never stretched with the panel.
        jobs.push(
          animate(
            state,
            label,
            [labelFrame(label, state.flight), labelFrame(targetLabel, target)],
            travel,
          ),
        );
        jobs.push(
          animate(
            state,
            period!,
            [
              { opacity: state.mode === 'open' ? 0 : 1 },
              { opacity: state.mode === 'open' ? 1 : 0 },
            ],
            160,
            state.mode === 'open' ? 240 : 0,
          ),
        );
      } else {
        // Reflowing long labels crossfade at their own typography instead of jumping lines.
        jobs.push(animate(state, label, [{ opacity: 1 }, { opacity: 0 }], 140));
      }
    }
    for (const { node, selector } of state.content) {
      const counterpart = target.querySelector<HTMLElement>(selector);
      if (counterpart) {
        const sameTagLayout =
          selector === '.tags' &&
          Math.abs(
            node.getBoundingClientRect().height -
              counterpart.getBoundingClientRect().height,
          ) < 2;
        jobs.push(
          ...moveContent(
            state,
            node,
            counterpart,
            target,
            travel,
            sameTagLayout,
          ),
        );
      } else {
        jobs.push(animate(state, node, [{ opacity: 1 }, { opacity: 0 }], 160));
      }
    }
  } else if (state.flight) {
    const surface = state.flight.querySelector<HTMLElement>('.glass-surface')!;
    jobs.push(animate(state, surface, [{ opacity: 1 }, { opacity: 0 }], 180));
    if (state.flightLabel)
      jobs.push(
        animate(
          state,
          state.flightLabel,
          [{ opacity: 1 }, { opacity: 0 }],
          180,
        ),
      );
    for (const { node } of state.content)
      jobs.push(animate(state, node, [{ opacity: 1 }, { opacity: 0 }], 180));
    state.mode = 'fade';
    document.documentElement.dataset.motion = 'fade';
  }
  for (const element of layers(document)) {
    if (element.hasAttribute('data-flight-target')) continue;
    const material = element.dataset.navLayer === 'surface';
    let delay = moving ? 300 : 0;
    if (tagFlight && element.closest('.tag-heading')) delay = 200;
    if (moving && element.closest('.article-heading .eyebrow')) delay = 200;
    if (moving && element.closest('.reading-card')) delay = 330;
    if (moving && element.closest('.toc')) delay = 370;
    // Only text moves. The refractive surface fades in place against its real
    // backdrop; no opacity/transform animation is applied to the card ancestor.
    jobs.push(
      animate(
        state,
        element,
        material
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: 'translateY(6px)' },
              { opacity: 1, transform: 'none' },
            ],
        260,
        delay,
      ),
    );
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
  if (!state.flightLabel || state.motionFinished) {
    focusDestination(state);
    pendingFocus = undefined;
  }
});

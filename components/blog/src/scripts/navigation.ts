import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from 'astro:transitions/client';
import { prepareGlass } from './glass';

// Grow live material independently of content clipping. Clipping/fading a parent
// of backdrop-filter changes its backdrop root and loses the refracted scene.
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
  mode: 'open' | 'close' | 'reveal';
  item?: Item;
  keyboard: boolean;
  traversal: boolean;
  hash: string;
  animations: Animation[];
  cards: Map<HTMLElement, boolean>;
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
  curve = frames.at(-1)?.opacity === 0 ? 'ease-in-out' : easing,
) {
  if (element.closest('.glass-flight')) {
    // Keep fixed typography inline. WebKit can skip position updates when the
    // same effect redundantly animates an unchanged font size.
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
    easing: curve,
    fill: 'both',
  });
  state.animations.push(animation);
  await animation.finished.catch(() => {});
}

function revealText(
  state: Navigation,
  element: HTMLElement,
  opening: boolean,
  duration: number,
  delay = 0,
  start = 0,
  end = element.getBoundingClientRect().height,
) {
  const height = element.getBoundingClientRect().height;
  const frame = (edge: number, visibility: string): Keyframe => ({
    // Negative bottom insets release shadows/descenders after the edge passes.
    clipPath: `inset(0px -24px ${height - edge}px -24px)`,
    visibility,
  });
  const closed = frame(start, 'hidden');
  const open = frame(end, 'visible');
  return animate(
    state,
    element,
    opening ? [closed, open] : [open, closed],
    duration,
    delay,
    opening ? easing : 'ease-in-out',
  );
}

function revealCard(
  state: Navigation,
  card: HTMLElement,
  opening: boolean,
  delay = 0,
) {
  if (reduced.matches) return [];
  if (!state.cards.has(card)) state.cards.set(card, card.inert);
  card.inert = true;
  const box = card.getBoundingClientRect();
  const inset = parseFloat(getComputedStyle(card).paddingBottom) || 0;
  const surface = card.querySelector<HTMLElement>(':scope > .glass-surface');
  // Keep the layout's full height for scroll restoration and stable neighboring
  // cards. Long articles unfold within the viewport; their offscreen remainder
  // is restored on handoff without a scroll-height jump.
  const onScreen = box.bottom > 0 && box.top < innerHeight;
  const start = onScreen ? Math.max(0, -box.top - 32) : 0;
  const end = onScreen
    ? Math.min(box.height, innerHeight - box.top + inset + 32)
    : box.height;
  const duration = onScreen ? (opening ? 360 : 260) : 0;
  const jobs: Promise<unknown>[] = [];
  if (
    surface &&
    surface !== state.source &&
    !surface.hasAttribute('data-flight-target')
  ) {
    const closed = { height: `${start}px`, visibility: 'hidden' };
    const open = { height: `${end}px`, visibility: 'visible' };
    jobs.push(
      animate(
        state,
        surface,
        opening ? [closed, open] : [open, closed],
        duration,
        onScreen ? delay : 0,
        opening ? easing : 'ease-in-out',
      ),
    );
  }
  for (const child of card.children) {
    if (
      !(child instanceof HTMLElement) ||
      child === surface ||
      child === state.sourceLabel ||
      child.hasAttribute('data-flight-target') ||
      state.content.some(({ source }) => child === source)
    )
      continue;
    const top = child.getBoundingClientRect().top - box.top;
    jobs.push(
      revealText(
        state,
        child,
        opening,
        duration,
        onScreen ? delay : 0,
        start - top - inset,
        end - top - inset,
      ),
    );
  }
  return jobs;
}
function clean(state: Navigation) {
  state.animations.forEach((animation) => animation.cancel());
  state.cards.forEach((inert, card) => {
    card.inert = inert;
  });
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
  const morphTitle =
    node.classList.contains('glass-flight-label') &&
    singleLine(node) &&
    singleLine(target);
  if (fixedLayout || morphTitle)
    return [animate(state, node, [from, to], duration)];

  // Descriptions and wrapped titles keep two stable typeset layouts as they move.
  // This also avoids WebKit losing paragraph geometry during font-size animation.
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
        jobs.push(
          revealText(
            state,
            child,
            true,
            240,
            child.classList.contains('eyebrow') ? 200 : 300,
          ),
        );
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

import { prepareGlass } from './glass';

export const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

type Item = { kind: 'post' | 'tag'; key: string };
type ContentFlight = {
  source: HTMLElement;
  node: HTMLElement;
  selector: string;
  kind: 'title' | 'description' | 'tags';
};
export type Navigation = {
  mode: 'open' | 'close' | 'reveal';
  item?: Item;
  keyboard: boolean;
  traversal: boolean;
  hash: string;
  animations: Animation[];
  cards: Map<HTMLElement, boolean>;
  flight?: HTMLElement;
  source?: HTMLElement;
  content: ContentFlight[];
  pageLoaded?: boolean;
  motionFinished?: boolean;
};
export function cardFor(doc: Document, item: Item) {
  const attribute = `data-${item.kind}-key`;
  return [...doc.querySelectorAll<HTMLElement>(`[${attribute}]`)].find(
    (card) => card.getAttribute(attribute) === item.key,
  );
}
export function visible(card: HTMLElement) {
  const rect = card.getBoundingClientRect();
  const bottom = document
    .querySelector('.site-header')!
    .getBoundingClientRect().bottom;
  return rect.top >= bottom + 8 && rect.bottom <= innerHeight && rect.width > 0;
}
export function layers(doc: Document) {
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
export async function animate(
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

export function revealText(
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

export function revealCard(
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
export function clean(state: Navigation) {
  state.animations.forEach((animation) => animation.cancel());
  state.cards.forEach((inert, card) => {
    card.inert = inert;
  });
  state.flight?.remove();
  state.source?.style.removeProperty('visibility');
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

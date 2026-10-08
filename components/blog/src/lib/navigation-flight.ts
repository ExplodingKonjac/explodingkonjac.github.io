import { prepareGlass } from './glass';
import { animate, type Navigation } from './navigation-motion';

function panelFrame(
  panel: HTMLElement,
  radius = getComputedStyle(panel).borderRadius,
): Keyframe {
  const box = panel.getBoundingClientRect();
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    borderRadius: radius,
  };
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
export function launchFlight(state: Navigation, card: HTMLElement) {
  const original = card.querySelector<HTMLElement>(':scope > .glass-surface')!;
  const flight = document.createElement('div');
  flight.className = 'glass glass-flight';
  flight.inert = true;
  Object.assign(flight.style, panelFrame(card));
  const surface = original.cloneNode(true) as HTMLElement;
  surface.removeAttribute('style');
  surface.removeAttribute('data-nav-layer');
  flight.append(surface);
  const parts: { selector: string; kind: 'title' | 'description' | 'tags' }[] =
    [];
  if (state.item)
    parts.push({
      selector:
        state.item.kind === 'tag' ? '[data-tag-label]' : '[data-post-title]',
      kind: 'title',
    });
  if (state.item?.kind === 'post')
    parts.push(
      { selector: '[data-post-description]', kind: 'description' },
      { selector: '.tags', kind: 'tags' },
    );
  for (const { selector, kind } of parts) {
    const source = card.querySelector<HTMLElement>(selector);
    if (!source) continue;
    const node =
      kind === 'title'
        ? document.createElement('div')
        : (source.cloneNode(true) as HTMLElement);
    node.classList.add(
      kind === 'title' ? 'glass-flight-label' : 'glass-flight-content',
    );
    if (kind === 'title')
      node.textContent =
        state.item?.kind === 'tag' ? state.item.key : flightText(source);
    if (kind === 'description') node.classList.add('glass-flight-description');
    node.dataset.flightCopy = 'source';
    Object.assign(node.style, labelFrame(source, card));
    flight.append(node);
    state.content.push({ source, node, selector, kind });
    source.style.visibility = 'hidden';
  }
  document.querySelector('#glass-flight-layer')!.append(flight);
  state.flight = flight;
  state.source = original;
  prepareGlass(flight);
  original.style.visibility = 'hidden';
}

export function moveFlight(
  state: Navigation,
  target: HTMLElement,
  travel: number,
) {
  const flight = state.flight!;
  target.querySelector<HTMLElement>(
    ':scope > .glass-surface',
  )!.dataset.flightTarget = '';
  const jobs = [
    animate(
      state,
      flight,
      [panelFrame(flight, flight.style.borderRadius), panelFrame(target)],
      travel,
    ),
  ];
  for (const { node, selector, kind } of state.content) {
    const counterpart = target.querySelector<HTMLElement>(selector);
    if (!counterpart) {
      jobs.push(animate(state, node, [{ opacity: 1 }, { opacity: 0 }], 160));
    } else if (kind === 'title' && state.item?.kind === 'tag') {
      if (singleLine(node) && singleLine(counterpart)) {
        counterpart.dataset.flightTarget = '';
        jobs.push(
          animate(
            state,
            node,
            [labelFrame(node, flight), labelFrame(counterpart, target)],
            travel,
          ),
        );
      } else {
        // Wrapped tag labels fade without changing their typeset layout.
        jobs.push(animate(state, node, [{ opacity: 1 }, { opacity: 0 }], 140));
      }
    } else {
      const sameTagLayout =
        kind === 'tags' &&
        Math.abs(
          node.getBoundingClientRect().height -
            counterpart.getBoundingClientRect().height,
        ) < 2;
      jobs.push(
        ...moveContent(state, node, counterpart, target, travel, sameTagLayout),
      );
    }
  }
  return jobs;
}

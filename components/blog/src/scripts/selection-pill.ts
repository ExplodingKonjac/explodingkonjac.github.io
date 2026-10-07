const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const groups = new Map<HTMLElement, () => void>();
const duration = 280;

function initialize(group: HTMLElement) {
  const items = [...group.querySelectorAll<HTMLElement>('[data-pill-item]')];
  if (!items.length) return;
  const controller = new AbortController();
  const { signal } = controller;
  const pill = document.createElement('span');
  pill.className = 'selection-pill';
  pill.setAttribute('aria-hidden', 'true');
  group.prepend(pill);
  let hovered: HTMLElement | undefined;
  let target: HTMLElement | undefined;
  let frame = 0;
  let started = 0;
  let origin = new Map<HTMLElement, number>();
  let current = new Map<HTMLElement, number>();

  // Interpolate item bounds, not stale pixel endpoints: the navbar can reshape
  // while the pill travels, and rapid pointer changes continue from its position.
  function weights(now: number) {
    if (!target) return new Map<HTMLElement, number>();
    const progress = reduced.matches
      ? 1
      : Math.min(1, (now - started) / duration);
    const mix = 1 - (1 - progress) ** 3;
    const result = new Map(
      [...origin].map(([item, value]) => [item, value * (1 - mix)]),
    );
    result.set(target, (result.get(target) ?? 0) + mix);
    return result;
  }
  function paint(now: number) {
    frame = 0;
    const bounds = group.getBoundingClientRect();
    let x = 0,
      y = 0,
      width = 0,
      height = 0;
    current = weights(now);
    for (const [item, weight] of current) {
      if (!weight) continue;
      const rect = item.getBoundingClientRect();
      x +=
        (rect.left - bounds.left - group.clientLeft + group.scrollLeft) *
        weight;
      y += (rect.top - bounds.top - group.clientTop + group.scrollTop) * weight;
      width += rect.width * weight;
      height += rect.height * weight;
    }
    pill.style.transform = `translate(${x}px, ${y}px)`;
    pill.style.width = `${width}px`;
    pill.style.height = `${height}px`;
    if (!reduced.matches && now - started < duration) schedule();
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(paint);
  }
  function update() {
    const next =
      hovered ??
      items.find((item) => item.matches(':focus-visible')) ??
      items.find((item) =>
        item.matches(
          '[aria-current]:not([aria-current="false"]), [aria-selected="true"], [aria-pressed="true"]',
        ),
      ) ??
      items[0];
    if (next === target) return;
    const now = performance.now();
    origin = target ? current : new Map([[next, 1]]);
    started = target && !reduced.matches ? now : now - duration;
    target = next;
    cancelAnimationFrame(frame);
    paint(now);
    group.dataset.pillReady = '';
  }
  function itemAt(event: PointerEvent) {
    hovered =
      event.pointerType === 'touch'
        ? undefined
        : items.find((item) => item.contains(event.target as Node));
    update();
  }
  group.addEventListener('pointerover', itemAt, { signal });
  group.addEventListener('pointermove', itemAt, { signal });
  group.addEventListener(
    'pointerleave',
    () => {
      hovered = undefined;
      update();
    },
    { signal },
  );
  group.addEventListener(
    'pointercancel',
    () => {
      hovered = undefined;
      update();
    },
    { signal },
  );
  group.addEventListener('focusin', update, { signal });
  group.addEventListener('focusout', () => queueMicrotask(update), { signal });
  // Keyboard input takes over from a stationary mouse; touch leaves no sticky hover.
  document.addEventListener(
    'keydown',
    () => {
      hovered = undefined;
      update();
    },
    { signal },
  );
  reduced.addEventListener('change', schedule, { signal });
  const resize = new ResizeObserver(schedule);
  resize.observe(group);
  items.forEach((item) => resize.observe(item));
  const selection = new MutationObserver(update);
  selection.observe(group, {
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-current', 'aria-selected', 'aria-pressed'],
  });
  update();
  return () => {
    controller.abort();
    cancelAnimationFrame(frame);
    resize.disconnect();
    selection.disconnect();
    pill.remove();
    delete group.dataset.pillReady;
  };
}

function initializeGroups() {
  for (const [group, dispose] of groups) {
    if (!group.isConnected) {
      dispose();
      groups.delete(group);
    }
  }
  document
    .querySelectorAll<HTMLElement>('[data-pill-group]')
    .forEach((group) => {
      if (groups.has(group)) return;
      const dispose = initialize(group);
      if (dispose) groups.set(group, dispose);
    });
}
document.addEventListener('astro:page-load', initializeGroups);
initializeGroups();

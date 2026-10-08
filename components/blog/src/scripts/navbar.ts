import { refreshGlass } from './glass';

const header = document.querySelector<HTMLElement>('.site-header')!;
const surface = header.querySelector<HTMLElement>('.glass-surface')!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let progress = Math.min(1, Math.max(0, scrollY / 120));
let frame = 0;
let routeAnimation = 0;
const smooth = (t: number) => t * t * (3 - 2 * t);

function paint(value: number) {
  progress = value;
  // Astro persists the header, but replaces its surrounding layout on every route.
  // A cached shell would be detached and report zero-sized bounds after a swap.
  const bounds = document
    .querySelector<HTMLElement>('.shell')!
    .getBoundingClientRect();
  const mobile = innerWidth <= 600;
  const style = getComputedStyle(header);
  const floatingHeight = parseFloat(
    style.getPropertyValue('--nav-floating-height'),
  );
  const dockedHeight = parseFloat(
    style.getPropertyValue('--nav-docked-height'),
  );
  const height = floatingHeight + (dockedHeight - floatingHeight) * value;
  const top =
    parseFloat(getComputedStyle(document.querySelector('.header-slot')!).top) ||
    (mobile ? 12 : 20);
  const width = document.documentElement.clientWidth;
  header.dataset.navReady = '';
  header.dataset.docked = value >= 0.999 ? 'true' : 'false';
  header.style.left = `${bounds.left * (1 - value)}px`;
  header.style.width = `${bounds.width + (width - bounds.width) * value}px`;
  header.style.top = `${top * (1 - value)}px`;
  header.style.height = `${height}px`;
  header.style.borderRadius = `${(mobile ? 22 : 28) * (1 - value)}px`;
  header.style.setProperty('--nav-progress', String(value));
  document.documentElement.style.setProperty(
    '--anchor-offset',
    `${top * (1 - value) + height + 20}px`,
  );
  document.documentElement.style.setProperty('--header-height', `${height}px`);
  refreshGlass(surface);
}
function schedule() {
  if (frame || routeAnimation) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    paint(smooth(Math.min(1, Math.max(0, scrollY / 120))));
  });
}
window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('resize', schedule, { passive: true });
document.addEventListener('blog:language-change', schedule);
window.addEventListener(
  'wheel',
  () => {
    cancelAnimationFrame(routeAnimation);
    routeAnimation = 0;
    schedule();
  },
  { passive: true },
);
window.addEventListener(
  'touchstart',
  () => {
    cancelAnimationFrame(routeAnimation);
    routeAnimation = 0;
    schedule();
  },
  { passive: true },
);

document.addEventListener('astro:after-swap', () => {
  cancelAnimationFrame(frame);
  frame = 0;
  cancelAnimationFrame(routeAnimation);
  const from = progress;
  const to = smooth(Math.min(1, Math.max(0, scrollY / 120)));
  if (reduced.matches || Math.abs(from - to) < 0.001) {
    routeAnimation = 0;
    paint(to);
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / 360);
    paint(from + (to - from) * (1 - (1 - t) ** 3));
    routeAnimation = t < 1 ? requestAnimationFrame(tick) : 0;
  };
  routeAnimation = requestAnimationFrame(tick);
});
paint(progress);

/** Real backdrop displacement on Blink; other engines keep the same clear tint. */
const svgNS = 'http://www.w3.org/2000/svg';
const supportsRefraction =
  /(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent) &&
  CSS.supports('backdrop-filter', 'url("#glass")');
const filters = new Map<
  HTMLElement,
  {
    filter: SVGFilterElement;
    image: SVGFEImageElement;
    frost: SVGFEGaussianBlurElement;
    lens: SVGFEDisplacementMapElement;
    key: string;
  }
>();
let serial = 0;

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
) {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs))
    element.setAttribute(key, value);
  return element;
}

// A rounded-rectangle lens: neutral center, a curved inward normal at the rim.
// The map contains vectors, not a screenshot, so arbitrary remote images work.
function displacement(
  width: number,
  height: number,
  radius: number,
  band: number,
  dock: number,
  ramp: number,
) {
  const ratio = Math.min(0.5, 1024 / Math.max(width, height));
  const w = Math.max(2, Math.ceil(width * ratio));
  const h = Math.max(2, Math.ceil(height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d')!;
  const map = context.createImageData(w, h);
  const bend = (depth: number) =>
    depth < 0 || depth > band
      ? 0
      : Math.sin((Math.PI * depth) / band) * Math.sqrt(1 - depth / band);
  const blurWeight = (depth: number) => {
    const t = Math.min(1, Math.max(0, depth / ramp));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < h; y++) {
    const py = ((y + 0.5) * height) / h - height / 2;
    for (let x = 0; x < w; x++) {
      const index = (y * w + x) * 4;
      map.data[index] = map.data[index + 1] = 128;
      map.data[index + 3] = 255;
      const px = ((x + 0.5) * width) / w - width / 2;
      const qx = Math.abs(px) - (width / 2 - radius);
      const qy = Math.abs(py) - (height / 2 - radius);
      const ax = Math.max(qx, 0),
        ay = Math.max(qy, 0);
      const distance = Math.hypot(ax, ay);
      const depth = radius - distance - Math.min(Math.max(qx, qy), 0);
      // Blue stores a smooth blur mask; red/green remain independent lens vectors.
      // Docked navigation graduates from its bottom only, with no clear top/sides.
      map.data[index + 2] = Math.round(
        255 *
          (blurWeight(depth) * (1 - dock) + blurWeight(height / 2 - py) * dock),
      );
      const strength = bend(depth);
      const nx = distance > 0 ? ax / distance : qx > qy ? 1 : 0;
      const ny = distance > 0 ? ay / distance : qy >= qx ? 1 : 0;
      // A docked navbar has one free edge: its bottom. Blend the vector fields
      // with the same progress as its geometry so top/side optics fade smoothly.
      map.data[index] = Math.round(
        128 - Math.sign(px) * nx * strength * (1 - dock) * 124,
      );
      map.data[index + 1] = Math.round(
        128 -
          (Math.sign(py) * ny * strength * (1 - dock) +
            bend(height / 2 - py) * dock) *
            124,
      );
    }
  }
  context.putImageData(map, 0, 0);
  return canvas.toDataURL();
}

function update(surface: HTMLElement) {
  if (!supportsRefraction || !surface.isConnected) return;
  const rect = surface.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const width = Math.round(rect.width),
    height = Math.round(rect.height);
  const style = getComputedStyle(surface);
  const setting = (name: string, fallback: number) => {
    const value = parseFloat(style.getPropertyValue(name));
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
  };
  const strength = setting('--refraction-strength', 32);
  const blur = setting('--blur', 8);
  const edgeBlur = blur * Math.min(1, setting('--blur-edge-ratio', 0.25));
  const additionalBlur = Math.sqrt(blur * blur - edgeBlur * edgeBlur);
  const ramp = Math.max(
    1,
    Math.min(setting('--blur-ramp', 64), width / 2, height / 2),
  );
  const band = Math.max(1, setting('--refraction-width', 18));
  const dock = Math.min(1, setting('--refraction-dock', 0));
  const radius = Math.min(
    parseFloat(style.borderTopLeftRadius) || 0,
    width / 2,
    height / 2,
  );
  const key = `${width}:${height}:${Math.round(radius)}:${band}:${dock.toFixed(3)}:${ramp}`;
  let entry = filters.get(surface);
  const defs = document.querySelector('#glass-filters defs');
  if (!defs) return;
  if (!entry) {
    const id = `glass-lens-${++serial}`;
    const filter = node('filter', {
      id,
      x: '0',
      y: '0',
      filterUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB',
    });
    const image = node('feImage', {
      result: 'normal',
      preserveAspectRatio: 'none',
    });
    const lens = node('feDisplacementMap', {
      in: 'graduated',
      in2: 'normal',
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'lens',
    });
    const frost = node('feGaussianBlur', {
      in: 'SourceGraphic',
      result: 'frost',
    });
    filter.append(
      image,
      node('feColorMatrix', {
        in: 'normal',
        type: 'matrix',
        values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0',
        result: 'blur-mask',
      }),
      frost,
      node('feComposite', {
        in: 'frost',
        in2: 'blur-mask',
        operator: 'in',
        result: 'center',
      }),
      // One opaque backdrop blend keeps the tint continuous; no extra rim layer.
      node('feComposite', {
        in: 'center',
        in2: 'SourceGraphic',
        operator: 'over',
        result: 'graduated',
      }),
      lens,
    );
    defs.append(filter);
    entry = { filter, image, lens, frost, key: '' };
    filters.set(surface, entry);
    surface.style.setProperty('--refraction', `url("#${id}")`);
  }
  // Material settings can change independently of the cached geometry map.
  if (surface.style.getPropertyValue('--blur-base') !== `${edgeBlur}px`)
    surface.style.setProperty('--blur-base', `${edgeBlur}px`);
  if (entry.frost.getAttribute('stdDeviation') !== String(additionalBlur))
    entry.frost.setAttribute('stdDeviation', String(additionalBlur));
  if (entry.lens.getAttribute('scale') !== String(strength))
    entry.lens.setAttribute('scale', String(strength));
  if (entry.key === key) return;
  entry.key = key;
  entry.filter.setAttribute('width', String(width));
  entry.filter.setAttribute('height', String(height));
  entry.image.setAttribute('width', String(width));
  entry.image.setAttribute('height', String(height));
  entry.image.setAttribute(
    'href',
    displacement(width, height, radius, band, dock, ramp),
  );
  surface.dataset.refractive = '';
}
const observer = new ResizeObserver((entries) => {
  for (const entry of entries) update(entry.target as HTMLElement);
});

export function prepareGlass(root: ParentNode = document) {
  for (const [surface, entry] of filters) {
    if (!surface.isConnected) {
      observer.unobserve(surface);
      entry.filter.remove();
      filters.delete(surface);
    }
  }
  root.querySelectorAll<HTMLElement>('.glass-surface').forEach((surface) => {
    if (supportsRefraction) {
      update(surface);
      observer.observe(surface);
    }
  });
}

// Radius changes during the navbar reshape even when its dimensions round equally.
export function refreshGlass(surface: HTMLElement) {
  update(surface);
}
prepareGlass();

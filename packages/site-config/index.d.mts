export interface SiteComponent {
  id: string;
  package: string;
  directory: string;
  mount: string;
  title: string;
  description: string;
}
export const site: Readonly<{
  origin: string;
  name: string;
  description: string;
  github: string;
}>;
export const components: readonly SiteComponent[];
export function component(id: string): SiteComponent;
export function componentUrl(id: string, ...segments: string[]): string;
export function absoluteUrl(path: string): string;

interface Window {
  __blogLocale?: {
    readonly language: 'en' | 'zh-CN';
    text(key: string, params?: Record<string, string | number>): string;
    apply(doc?: Document): void;
  };
}

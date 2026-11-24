import { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';

export const FONT_HAND = '"Yomogi", "Zen Maru Gothic", "Noto Sans JP", sans-serif';
export const FONT_MARU = '"Zen Maru Gothic", "Noto Sans JP", sans-serif';
export const FONT_SANS = '"Noto Sans JP", "Zen Maru Gothic", sans-serif';
export const FONT_SERIF = '"Playfair Display", "Noto Serif JP", Georgia, serif';
export const FONT_UI_SANS = '"Noto Sans JP", system-ui, -apple-system, sans-serif';

export const STICKMAN_COLLAGE_FONTS = {
  hand: FONT_HAND,
  maru: FONT_MARU,
  sans: FONT_SANS,
  serif: FONT_SERIF,
  uiSans: FONT_UI_SANS,
} as const;

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&family=Noto+Serif+JP:wght@700;900&family=Playfair+Display:wght@700;900&family=Yomogi&family=Zen+Maru+Gothic:wght@700;900&display=swap';

const DEFAULT_LOCAL_CSS_PATH = 'fonts/plan_c/fonts.css';
const STYLESHEET_ELEMENT_ID = 'stickman-collage-ofl-fonts-stylesheet';

let fontLoadPromise: Promise<void> | null = null;

export interface EnsureStickmanCollageFontsOptions {
  localCssPath?: string;
  timeoutMs?: number;
}

/**
 * SIL OFL 1.1 フォント一式を読み込む。
 * ローカル（public/fonts/plan_c/fonts.css）を優先し、未存在時は Google Fonts CDN へフォールバックする。
 */
export function ensureStickmanCollageFontsLoaded(
  options: EnsureStickmanCollageFontsOptions = {},
): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.resolve();
  }
  if (fontLoadPromise) {
    return fontLoadPromise;
  }

  const localCssPath = options.localCssPath ?? DEFAULT_LOCAL_CSS_PATH;
  const timeoutMs = options.timeoutMs ?? 3500;

  fontLoadPromise = (async () => {
    if (!document.getElementById(STYLESHEET_ELEMENT_ID)) {
      const localUrl = staticFile(localCssPath);
      let href = GOOGLE_FONTS_URL;
      try {
        const res = await fetch(localUrl, { method: 'HEAD' });
        if (res.ok) {
          href = localUrl;
        }
      } catch {
        // ローカル未配置時は Google Fonts CDN を使用
      }

      const link = document.createElement('link');
      link.id = STYLESHEET_ELEMENT_ID;
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }

    await Promise.race([
      document.fonts.ready.then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  })();

  return fontLoadPromise;
}

/**
 * Remotion 描画開始前に SIL OFL 1.1 フォント読み込み完了を待機するフック。
 */
export const useStickmanCollageFonts = (
  options?: EnsureStickmanCollageFontsOptions,
): boolean => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handle = delayRender('Loading SIL OFL fonts for stickman_collage');
    let cancelled = false;

    ensureStickmanCollageFontsLoaded(options)
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
        continueRender(handle);
      });

    return () => {
      cancelled = true;
    };
  }, [options?.localCssPath, options?.timeoutMs]);

  return ready;
};

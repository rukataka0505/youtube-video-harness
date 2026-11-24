import { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import {
  EnsureCommonFontsOptions,
  FONT_SANS as BASE_FONT_SANS,
  FONT_SERIF as BASE_FONT_SERIF,
  FONT_UI_SANS as BASE_FONT_UI_SANS,
  ensureCommonFontsLoaded,
} from '../common/fonts';

export const FONT_ECON_SANS = BASE_FONT_SANS;
export const FONT_ECON_SERIF = BASE_FONT_SERIF;
export const FONT_ECON_UI_SANS = BASE_FONT_UI_SANS;
export const FONT_ECON_MONO = '"Cascadia Mono", ui-monospace, Consolas, monospace';

export const PLAN_E_FONTS = {
  sans: FONT_ECON_SANS,
  serif: FONT_ECON_SERIF,
  uiSans: FONT_ECON_UI_SANS,
  mono: FONT_ECON_MONO,
} as const;

/**
 * 案E（planE_macro_econ）向け SIL OFL 1.1 フォント待機フック。
 * studio/public/fonts/plan_c/fonts.css（Noto Sans JP / Noto Serif JP / Playfair Display）を再利用し、
 * Adobe / Morisawa 等の非ライセンスフォント同梱を防止する。
 */
export const usePlanEFonts = (options?: EnsureCommonFontsOptions): boolean => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handle = delayRender('Loading SIL OFL fonts for Plan E Macro Econ');
    let cancelled = false;

    ensureCommonFontsLoaded(options)
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

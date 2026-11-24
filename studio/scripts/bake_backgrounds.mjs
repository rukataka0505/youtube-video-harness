import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';

const TARGETS = [
  { key: 'black', compositionId: 'BakeBg-black', fileName: 'black.png' },
  { key: 'white_sketch', compositionId: 'BakeBg-white-sketch', fileName: 'white_sketch.png' },
  { key: 'grid_paper', compositionId: 'BakeBg-grid-paper', fileName: 'grid_paper.png' },
  { key: 'wood_desk', compositionId: 'BakeBg-wood-desk', fileName: 'wood_desk.png' },
  { key: 'kraft_cork', compositionId: 'BakeBg-kraft-cork', fileName: 'kraft_cork.png' },
  { key: 'blueprint', compositionId: 'BakeBg-blueprint', fileName: 'blueprint.png' },
  { key: 'cream_notebook', compositionId: 'BakeBg-cream-notebook', fileName: 'cream_notebook.png' },
  { key: 'light_table', compositionId: 'BakeBg-light-table', fileName: 'light_table.png' },
  { key: 'light_beam_haze', compositionId: 'BakeBg-light-beam-haze', fileName: 'light_beam_haze.png' },
  { key: 'grain_tile', compositionId: 'BakeBg-grain-tile', fileName: 'grain_tile.png' },
];

const POLARITY_KEYS = [
  'black',
  'white_sketch',
  'grid_paper',
  'wood_desk',
  'kraft_cork',
  'blueprint',
  'cream_notebook',
  'light_table',
];

function parseArgs(argv) {
  const args = {
    only: null,
    outDir: null,
    verifyCompareDir: null,
    compareSec: 2.5,
    compareActorX: 760,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--only' && argv[i + 1]) {
      args.only = argv[i + 1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
    } else if (token === '--out-dir' && argv[i + 1]) {
      args.outDir = argv[i + 1];
      i += 1;
    } else if (token === '--verify-compare' && argv[i + 1]) {
      args.verifyCompareDir = argv[i + 1];
      i += 1;
    } else if (token === '--sec' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed)) {
        args.compareSec = parsed;
      }
      i += 1;
    } else if (token === '--actor-x' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed)) {
        args.compareActorX = parsed;
      }
      i += 1;
    } else if (token === '--help' || token === '-h') {
      console.log(
        [
          '使い方: node scripts/bake_backgrounds.mjs [オプション]',
          '',
          'オプション:',
          '  --only <keys>          カンマ区切りで対象を指定（例: black,wood_desk,grain_tile）',
          '  --out-dir <dir>        出力先ディレクトリ（既定: studio/public/backgrounds）',
          '  --verify-compare <dir> ベイク後に全8背景の旧プロシージャル vs 新ベイク PNG の代表フレーム比較画像を出力',
          '  --sec <number>         比較フレームの時刻秒（既定: 2.5）',
          '  --actor-x <number>     比較フレームの actorX（既定: 760）',
        ].join('\n'),
      );
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const studioRoot = path.resolve(scriptDir, '..');
  const entryPoint = path.join(studioRoot, 'src', 'bakeBackgroundsEntry.ts');
  const studioPublicDir = path.join(studioRoot, 'public');
  const outDir = args.outDir
    ? path.resolve(args.outDir)
    : path.join(studioPublicDir, 'backgrounds');

  const selectedTargets = args.only
    ? TARGETS.filter((t) => args.only.includes(t.key))
    : TARGETS;

  if (selectedTargets.length === 0) {
    console.error(
      `指定された --only キーに一致するターゲットがありません。指定可能: ${TARGETS.map((t) => t.key).join(', ')}`,
    );
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-bake-bg-'));
  const emptyPublicPlaceholder = path.join(tempRoot, '__skip_public_copy__');
  const bundleOutDir = path.join(tempRoot, 'bundle');
  fs.mkdirSync(bundleOutDir, { recursive: true });

  let browser = null;
  let linkedPublicPath = null;

  try {
    console.log(`[bake-bg] Remotion バンドルを開始します: ${entryPoint}`);
    const serveUrl = await bundle({
      entryPoint,
      outDir: bundleOutDir,
      publicDir: emptyPublicPlaceholder,
      enableCaching: true,
    });

    // studio/public 全量コピーを避け、ジャンクション/シンボリックリンクで接続する
    const candidateBundlePublic = path.join(bundleOutDir, 'public');
    if (fs.existsSync(studioPublicDir) && !fs.existsSync(candidateBundlePublic)) {
      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(studioPublicDir, candidateBundlePublic, linkType);
      linkedPublicPath = candidateBundlePublic;
    }

    console.log('[bake-bg] ヘッドレスブラウザを起動しています...');
    browser = await openBrowser('chrome');

    for (const target of selectedTargets) {
      const outPath = path.join(outDir, target.fileName);
      const composition = await selectComposition({
        serveUrl,
        id: target.compositionId,
        puppeteerInstance: browser,
      });

      const t0 = Date.now();
      await renderStill({
        composition,
        serveUrl,
        output: outPath,
        puppeteerInstance: browser,
        imageFormat: 'png',
        overwrite: true,
        frame: 0,
      });
      const stat = fs.statSync(outPath);
      const kb = (stat.size / 1024).toFixed(1);
      const ms = Date.now() - t0;
      console.log(
        `[bake-bg] 書き出し完了: ${target.fileName} (${composition.width}x${composition.height}, ${kb} KB, ${ms} ms)`,
      );
    }

    if (args.verifyCompareDir) {
      const compareDir = path.resolve(args.verifyCompareDir);
      fs.mkdirSync(compareDir, { recursive: true });
      const compareTargets = args.only
        ? POLARITY_KEYS.filter((k) => args.only.includes(k))
        : POLARITY_KEYS;

      console.log(
        `[bake-bg] 全 ${compareTargets.length} 背景の代表フレーム比較画像（before=procedural / after=baked）を出力します: ${compareDir}`,
      );

      for (const polarity of compareTargets) {
        for (const mode of [
          { label: 'before_procedural', useBaked: false },
          { label: 'after_baked', useBaked: true },
        ]) {
          const inputProps = {
            polarity,
            sec: args.compareSec,
            actorX: args.compareActorX,
            useBaked: mode.useBaked,
            animated: true,
          };
          const composition = await selectComposition({
            serveUrl,
            id: 'CompareBg-Preview',
            inputProps,
            puppeteerInstance: browser,
          });
          const outPath = path.join(compareDir, `${polarity}_${mode.label}.png`);
          const t0 = Date.now();
          await renderStill({
            composition,
            serveUrl,
            output: outPath,
            inputProps,
            puppeteerInstance: browser,
            imageFormat: 'png',
            overwrite: true,
            frame: 0,
          });
          console.log(`[bake-bg] 比較出力: ${path.basename(outPath)} (${Date.now() - t0} ms)`);
        }
      }
    }

    console.log(`[bake-bg] すべての書き出しが完了しました（出力先: ${outDir}）。`);
  } finally {
    if (browser) {
      try {
        await browser.close({ silent: false });
      } catch {
        // 終了時のブラウザクローズ例外は無視
      }
    }
    // 重要: ジャンクション本体のみ先に外してから一時ディレクトリを削除する（実 studio/public を保護）
    if (linkedPublicPath && fs.existsSync(linkedPublicPath)) {
      try {
        const stat = fs.lstatSync(linkedPublicPath);
        if (stat.isSymbolicLink()) {
          fs.unlinkSync(linkedPublicPath);
        }
      } catch {
        try {
          fs.rmdirSync(linkedPublicPath);
        } catch {
          // 無視
        }
      }
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[bake-bg] 背景ベイク中にエラーが発生しました:', err);
  process.exit(1);
});

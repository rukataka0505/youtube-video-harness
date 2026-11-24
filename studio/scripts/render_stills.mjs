import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { getCompositions, openBrowser, renderStill, selectComposition } from '@remotion/renderer';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--job' && argv[i + 1]) {
      args.job = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

/**
 * 書き出し済みバリアント PNG を比較シート <Still> へ安全に配信するための
 * 一時ローカル HTTP サーバー（127.0.0.1 の空きポートを使用）。
 */
async function startLocalImageServer(imageRegistry) {
  const server = http.createServer((req, res) => {
    const reqUrl = req.url ?? '';
    const match = /^\/img\/([a-zA-Z0-9_-]+)\.png(?:\?.*)?$/.exec(reqUrl);
    if (!match) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const filePath = imageRegistry.get(match[1]);
    if (!filePath || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Image Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.job) {
    console.error('使い方: node scripts/render_stills.mjs --job <job.json>');
    process.exit(1);
  }

  const jobPath = path.resolve(parsed.job);
  if (!fs.existsSync(jobPath)) {
    console.error(`ジョブ定義ファイルが見つかりません: ${jobPath}`);
    process.exit(1);
  }

  const job = JSON.parse(fs.readFileSync(jobPath, 'utf-8'));
  const tasks = Array.isArray(job.tasks) ? job.tasks : [];
  if (tasks.length === 0) {
    console.error('ジョブ定義の tasks が空です。');
    process.exit(1);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const studioRoot = path.resolve(scriptDir, '..');
  const episode = job.entry === 'episode';
  const entryPoint = path.join(studioRoot, 'src', episode ? 'index.ts' : 'thumbnailEntry.ts');
  const studioPublicDir = path.join(studioRoot, 'public');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-still-bundle-'));
  const emptyPublicPlaceholder = path.join(tempRoot, '__skip_public_copy__');
  const bundleOutDir = path.join(tempRoot, 'bundle');
  fs.mkdirSync(bundleOutDir, { recursive: true });

  const imageRegistry = new Map();
  let imageServer = null;
  let imageBaseUrl = '';
  let imageCounter = 0;

  let browser = null;
  let linkedPublicPath = null;

  try {
    const needsImageServer = tasks.some(
      (t) => t.embedImageFiles && typeof t.embedImageFiles === 'object' && Object.keys(t.embedImageFiles).length > 0,
    );
    if (needsImageServer) {
      const started = await startLocalImageServer(imageRegistry);
      imageServer = started.server;
      imageBaseUrl = started.baseUrl;
    }

    console.log(`[スチル] Remotion バンドルを開始します: ${entryPoint}`);
    const serveUrl = await bundle({
      entryPoint,
      outDir: bundleOutDir,
      publicDir: emptyPublicPlaceholder,
      enableCaching: true,
    });

    // 868MB超の studio/public 全量コピーを避けるため、ジャンクション/シンボリックリンクで接続する
    const candidateBundlePublic = path.join(bundleOutDir, 'public');
    if (fs.existsSync(studioPublicDir) && !fs.existsSync(candidateBundlePublic)) {
      const linkType = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(studioPublicDir, candidateBundlePublic, linkType);
      linkedPublicPath = candidateBundlePublic;
    }

    console.log('[スチル] ヘッドレスブラウザを起動しています...');
    browser = await openBrowser('chrome');

    const outputs = [];
    const episodeCompositions = new Map();
    for (const task of tasks) {
      const outPath = path.resolve(task.outputPath);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });

      const resolvedInputProps = { ...(task.inputProps ?? {}) };

      // 比較シート等へ先行書き出し済みの実 PNG をローカル HTTP URL として注入する
      if (task.embedImageFiles && typeof task.embedImageFiles === 'object') {
        const variantImageUrls = { ...(resolvedInputProps.variantImageUrls ?? {}) };
        for (const [variantId, rawImgPath] of Object.entries(task.embedImageFiles)) {
          const absImgPath = path.resolve(String(rawImgPath));
          if (!fs.existsSync(absImgPath)) {
            throw new Error(
              `比較シート埋め込み対象の画像ファイルが見つかりません (${variantId}): ${absImgPath}`,
            );
          }
          imageCounter += 1;
          const token = `v${imageCounter}`;
          imageRegistry.set(token, absImgPath);
          variantImageUrls[variantId] = `${imageBaseUrl}/img/${token}.png`;
        }
        resolvedInputProps.variantImageUrls = variantImageUrls;
      }

      let composition;
      try {
        composition = episodeCompositions.get(task.compositionId) ?? await selectComposition({
          serveUrl,
          id: task.compositionId,
          inputProps: resolvedInputProps,
          puppeteerInstance: browser,
        });
        if (episode) episodeCompositions.set(task.compositionId, composition);
      } catch (err) {
        let availableIds = '';
        try {
          const comps = await getCompositions(serveUrl, { puppeteerInstance: browser });
          availableIds = comps.map((c) => c.id).join(', ');
        } catch {
          // 取得失敗時は無視
        }
        throw new Error(
          `指定された <Still> compositionId "${task.compositionId}" を選択できませんでした。` +
            (availableIds ? ` 登録済みID: [${availableIds}]` : '') +
            ` / 詳細: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (episode && (composition.fps !== job.fps || composition.durationInFrames !== job.totalFrames)) {
        throw new Error('全編の登録IDと、ビルド済みタイムラインの尺・fpsを確認してください。');
      }
      const targetWidth = task.width ?? composition.width;
      const targetHeight = task.height ?? composition.height;
      const scale = targetWidth / composition.width;

      console.log(
        `[スチル] レンダリング中 (${task.compositionId}): ${outPath} (${targetWidth}x${targetHeight})`,
      );

      await renderStill({
        composition,
        serveUrl,
        output: outPath,
        inputProps: resolvedInputProps,
        puppeteerInstance: browser,
        imageFormat: 'png',
        overwrite: true,
        scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        frame: task.frame ?? 0,
      });

      outputs.push({
        taskId: task.taskId ?? task.compositionId,
        compositionId: task.compositionId,
        outputPath: outPath,
        width: targetWidth,
        height: targetHeight,
      });
    }

    console.log(`[スチル] 全 ${outputs.length} 件の <Still> 書き出しが完了しました。`);
  } finally {
    if (browser) {
      try {
        await browser.close({ silent: false });
      } catch {
        // 終了時のブラウザクローズ例外は無視
      }
    }
    if (imageServer) {
      try {
        if (typeof imageServer.closeAllConnections === 'function') {
          imageServer.closeAllConnections();
        }
        await new Promise((resolve) => imageServer.close(() => resolve()));
      } catch {
        // 無視
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
  console.error('[スチル] レンダリング中にエラーが発生しました:', err);
  process.exit(1);
});

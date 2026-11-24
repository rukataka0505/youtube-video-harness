# フォント配置ルール（重要）

本ディレクトリに配置してよいフォントは、ローカル／Docker／AWS Lambda 等すべてのレンダリング環境で自由・無償に同梱可能なオープンライセンス書体に限る。

## 許可ライセンス
- **SIL Open Font License (OFL 1.1):** 例 `Noto Sans JP`, `源ノ角ゴシック`, `源暎フォント`, `Dela Gothic One` 等
- **Apache License 2.0:** 例 `けいふぉんと！` 等

## 配置ルール
- フォントファイル（`.ttf` / `.otf` / `.woff2`）を配置する際は、必ず元の `OFL.txt` / `LICENSE.txt` を同じディレクトリへ同梱する。
- **厳禁:** Adobe Fonts および Morisawa Fonts（デスクトップ契約）のフォントファイルをコピー・リポジトリ保存・Lambda/Docker同梱することは規約違反となるため一切禁止する。

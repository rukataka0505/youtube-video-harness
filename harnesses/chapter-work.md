# 章の演出を実装・検品する

音声ビルド後、リポジトリ直下で担当区間を指定する。台詞・語句アンカー・演出意図・素材・型の入口を標準出力の JSON で確認できる。
素材辞書は作品内で使える全素材。棒人間では各カットの `scene.assetIds` と `realAssetTargets` で担当分を引く。

```powershell
$tool = 'pipeline/scripts/chapter_work.py'
$py = '.\pipeline\.venv\Scripts\python.exe'
$spec = 'episodes/productions/adult-time-illusion/spec.json'
& $py $tool --spec $spec --chapter 1

$econ = 'episodes/productions/airline-mileage-bank/plan_e_spec.json'
& $py $tool --spec $econ --chunks seg_01_hook seg_02_vhs_flip --alignment
```

案Eの章境界は担当する先頭・末尾のチャンクIDで指定する。分割カットもビルド済みのフレーム境界を使う。
`--alignment` は担当区間の文字時刻まで必要な場合に付ける。

## 仕上がりを撮る

```powershell
& $py $tool --spec $spec --chapter 1 --stills "$env:TEMP/ch1-preview"
& $py $tool --spec $spec --chapter 1 --shot 1 --offset-frame 30 100 --stills "$env:TEMP/c01-fix"
& $py $tool --spec $econ --chunks seg_01_hook seg_01_hook --composition Prod-AirlineMileageBank --stills "$env:TEMP/hook-preview"
```

全編の登録コンポジションから各カットの中央を原寸 PNG で撮り、順番どおりに `sheet.png` に並べる。
`frames.json` が画像番号・チャンク・カット・全編のフレーム番号の対応表。修正時は新しい出力先と `--shot` を指定する。
ヒットの前後など任意の位置は `--offset-frame`（カット先頭を0とする）で追加できる。案Eは全編の登録IDを渡す。

## 型検査と統合

`studio/` で `npm run typecheck:chapter -- <担当ファイル.tsx>` を実行すると、そのファイルと依存先を本番の型設定で検査する。
各章の編集中はこの検査と実画像の確認を使う。統合担当が全章の揃った状態で `npm run typecheck` と各ハーネスの作品監査を通し、
書き出した MP4・音声のクロス検品へ進む。統合後に変更した場合も最終状態で検査する。

案Eのディレクトリ監査は本編のソースを対象とする。作品直下の `thumbnails/` はサムネ制作工程で検品する。
生成タイムラインに記録した出典URLと、描画コード内の外部素材参照は区別して検査する。

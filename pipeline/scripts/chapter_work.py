"""音声ビルドの正本から担当区間の演出材料と検品スチルを取り出す。"""

import argparse
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

STUDIO = Path(__file__).resolve().parents[2] / "studio"


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def select_rows(rows, chapter, bounds):
    if chapter is not None:
        selected = [row for row in rows if row.get("chapterIndex") == chapter]
        if not selected:
            raise ValueError("章が見つかりません。案Eは --chunks で始点・終点を指定してください。")
        return selected
    ids = [row["chunkId"] for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("chunkId が重複しています。")
    for bound in bounds:
        if bound not in ids:
            raise ValueError(f"チャンクが見つかりません: {bound}")
    first, last = (ids.index(bound) for bound in bounds)
    if first > last:
        raise ValueError("チャンクの開始と終了が逆です。")
    return rows[first:last + 1]


def stickman_material(spec, timeline, chapter, bounds, alignment):
    rows = select_rows(timeline["shots"], chapter, bounds)
    ids = {row["chunkId"] for row in rows}
    designs = {shot["chunkId"]: shot for ch in spec["chapters"] for shot in ch["shots"]}
    for row in rows:
        design = designs.get(row["chunkId"])
        if design is None and row["chunkId"] == "end_cta":
            design = {"narrationJa": (spec.get("endCta") or {}).get("narrationJa")}
        if design is None or any(row.get(key) != value for key, value in design.items()):
            raise ValueError(f"{row['chunkId']} の仕様と音声ビルド結果が一致しません。")
    chapter_ids = {row["chapterIndex"] for row in rows}
    targets = [item for item in spec.get("realAssetTargets", [])
               if ids.intersection(item.get("chunkIds", []))]
    return dict(
        compositionId=timeline["compositionId"],
        chapters=[ch for ch in timeline["chapters"] if ch["chapterIndex"] in chapter_ids],
        realAssetTargets=targets,
        assets={a["id"]: a for a in timeline.get("assetCatalog", [])},
        cuts=[{k: v for k, v in row.items() if alignment or k != "alignment"} for row in rows],
        types="studio/src/components/stickman_collage/index.ts",
    )


def plan_e_material(spec, timeline, chapter, bounds, alignment):
    rows = select_rows(spec["chunks"], chapter, bounds)
    # 案Eの映像カットは発話の開始・終了とは異なる。既存ビルドの分割済みフレームを使う。
    shots = iter(timeline["shots"])
    by_chunk = {}
    for chunk in spec["chunks"]:
        group = []
        for design in [chunk, *chunk.get("splits", [])]:
            shot = next(shots, None)
            if shot is None or design.get("shotLabel", chunk["chunkId"]) != shot["label"]:
                raise ValueError("カット構成と音声ビルド結果が一致しません。")
            group.append(shot)
        by_chunk[chunk["chunkId"]] = group
    if next(shots, None) is not None:
        raise ValueError("タイムラインに余分なカットがあります。")
    cuts = []
    for row in rows:
        key = row["chunkId"]
        timing = timeline["chunks"][key]
        if timing["text"] != row["text"]:
            from build_plan_e_assets import sanitize_japanese_tts_text
            if timing["text"] != sanitize_japanese_tts_text(row["text"])[0]:
                raise ValueError(f"{key} の台詞と音声ビルド結果が一致しません。")
        cut = {**row, "timing": timing, "shots": by_chunk[key]}
        if alignment:
            cut["charTimes"] = timeline["charTimes"][key]
        cuts.append(cut)
    return dict(cuts=cuts, assets=timeline["assets"], types="studio/src/components/plan_e/index.ts",
                  events={k: v for k, v in timeline["events"].items()
                          if cuts[0]["shots"][0]["startSec"] <= v <= cuts[-1]["shots"][-1]["endSec"]})


def chapter_material(spec_path, timeline_path, chapter, bounds, alignment):
    spec = load(spec_path)
    slug, fmt = spec["slug"], spec["formatId"]
    if fmt == "stickman_collage":
        default_path = spec_path.with_name("timeline.json")
    elif fmt == "planE_macro_econ":
        public = spec.get("output", {}).get("publicSubdir", f"episodes/{slug}")
        default_path = STUDIO / "public" / public / "timeline.json"
    else:
        raise ValueError(f"未対応の形式です: {fmt}")
    timeline = load(timeline_path or default_path)
    if (timeline["slug"], timeline["formatId"]) != (slug, fmt):
        raise ValueError("Spec とタイムラインの作品・形式が一致しません。")
    packet = {"slug": slug, "formatId": fmt, "fps": timeline["fps"],
              "totalFrames": timeline["totalFrames"]}
    extract = stickman_material if fmt == "stickman_collage" else plan_e_material
    packet.update(extract(spec, timeline, chapter, bounds, alignment))
    return packet


def render_sheet(packet, composition, offsets, destination, shot_index):
    if not composition:
        raise ValueError("全編の --composition を指定してください。")
    if destination.exists():
        raise ValueError(f"出力先が既に存在します: {destination}")
    frames = []
    selected = [(cut["chunkId"], shot) for cut in packet["cuts"] for shot in cut.get("shots", [cut])
                if shot_index is None or shot["shotIndex"] == shot_index]
    if not selected:
        raise ValueError("指定区間に該当するカットがありません。")
    for chunk_id, shot in selected:
        start, end = shot["startFrame"], shot["endFrame"]
        for offset in offsets or [(end - start) // 2]:
            frame = start + offset
            if not 0 <= start <= frame < end <= packet["totalFrames"]:
                raise ValueError(f"{chunk_id} の区間外フレームです: {frame}")
            frames.append({"chunkId": chunk_id, "shotIndex": shot["shotIndex"], "frame": frame,
                           "file": f"{len(frames):04}.png"})
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as temp:
        work = Path(temp)
        images = work / "images"
        images.mkdir()
        job = work / "job.json"
        job.write_text(json.dumps({
            "entry": "episode", "fps": packet["fps"], "totalFrames": packet["totalFrames"],
            "tasks": [{"compositionId": composition, "frame": item["frame"],
                       "outputPath": str(images / item["file"])} for item in frames],
        }), encoding="utf-8")
        subprocess.run(["node", "scripts/render_stills.mjs", "--job", str(job)], cwd=STUDIO, check=True)
        cols = min(3, len(frames))
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(images / "%04d.png"), "-vf",
                        f"scale=480:-1,tile={cols}x{math.ceil(len(frames) / cols)}",
                        "-frames:v", "1", str(images / "sheet.png")], check=True)
        (images / "frames.json").write_text(json.dumps(frames, ensure_ascii=False, indent=2), encoding="utf-8")
        images.rename(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", type=Path, required=True)
    parser.add_argument("--timeline", type=Path, help="標準配置以外の音声ビルド結果")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--chapter", type=int, help="棒人間の章番号")
    group.add_argument("--chunks", nargs=2, metavar=("FIRST", "LAST"), help="両端を含むチャンク区間")
    parser.add_argument("--alignment", action="store_true", help="文字単位の時刻も出力")
    parser.add_argument("--stills", type=Path, help="検品画像を保存する新規ディレクトリ")
    parser.add_argument("--composition", help="全編の登録ID（案Eのスチルで必須）")
    parser.add_argument("--shot", type=int, help="指定した shotIndex だけ撮影")
    parser.add_argument("--offset-frame", type=int, nargs="+", help="各カットの先頭からのフレーム数（既定は中央）")
    args = parser.parse_args()
    if not args.stills and (args.offset_frame or args.composition or args.shot is not None):
        parser.error("撮影オプションには --stills が必要です。")
    try:
        packet = chapter_material(args.spec, args.timeline, args.chapter, args.chunks, args.alignment)
        if args.stills:
            render_sheet(packet, args.composition or packet.get("compositionId"),
                         args.offset_frame, args.stills.resolve(), args.shot)
            print(args.stills.resolve())
        else:
            print(json.dumps(packet, ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"章の材料・検品画像を取得できません: {error}\n")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

# **ローカルPython環境で構築するYouTube異常値発掘・高収益導線・動画演出自動解析パイプライン設計書（2026年後半版）**

ローカルPython環境・YouTube Data API v3・Gemini APIのYouTube URLネイティブ解析を統合し、日本市場および海外市場から「後発でも勝てる穴場ジャンル・異常値（Outlier）動画・高収益導線」を定量的に自動発掘する実装パイプラインの全体設計を提示する。本設計の核は三点にある。第一に、過去1本の大型ヒットによる偽陰性を構造的に防ぐ**Leave-One-Out（LOO）同一フォーマット中央値比（Outlier Score）を主軸とし、時系列VPH・登録者倍率・相対エンゲージメントによる広告再生除外フィルタを組み合わせた定量判定エンジンである。第二に、2026年6月に刷新されたYouTube Data API v3の細分化クォータバケット（Granular Quota）**、自動生成プレイリスト（UULF/UUSH）、および新設のvideos.batchGetStats専用枠を活用し、無料デフォルト枠のまま日次16万件の時系列VPHスナップショット・5万動画詳細・15万コメントを収集する低クォータ設計である。第三に、通過した当たり動画のみをGemini APIのYouTube URLネイティブ入力へ渡し、Two-Pass Static Hybrid方式（冒頭60秒・2FPS高解像度＋全編・0.5FPS低解像度）で20分尺動画100本あたり約$4.54〜$10.34（2026年11月時点のモデル・Batch構成試算）の予測可能コストにて再現可能な演出仕様JSONを抜き出す構成である。  
2025年以前の既存リサーチ記事やチュートリアルをそのまま流用すると、2026年11月現在の本番運用では4つの重大な仕様変更と運用上の罠に直面する。まず、YouTube Data API v3は2026年6月1〜3日よりsearch.list（1日100回専用枠）・videos.insert（1日100回専用枠）・videos.batchGetStats（1日10,000回専用枠）・一般共有プール（1日10,000ユニット）へと完全分離されており、従来の「1万ユニット単一枠」前提では収集効率を著しく損なう。次に、YouTubeの公開viewCountは2025年3月31日（Shortsの再生開始・リプレイ即カウント化）、2026年8月27日（全フォーマットでの1フレーム目・自動再生・ホバー再生の即カウント化）、2026年11月16日（テレビ画面での複数人視聴Co-viewsの合算）と段階的に定義が拡張されたため、生涯平均を分母とする異常値判定は構造的インフレにより破綻する。さらに、クォータ節約の定番だったYouTube公式RSS（feeds/videos.xml）は2025年12月以降、開発者コミュニティや複数の死活監視において毎日UTC 09:00〜12:00前後に広範な404/500エラーが多発すると報告されており、一次データソースとして依存できない。加えて、Gemini APIは2026年12月1日にgemini-4-argon/carbon、2027年1月1日にgemini-3.8-flash/3.6-flashの標準単価が2倍へ改定される予定であるほか、Agentic動画処理には思考トークン暴騰とサイレント・フォールバックの実装リスクが報告されているため、静的ハイブリッド方式とBatch API（50%割引）の併用を前提とする必要がある。

## **1\. 後発でも勝てる「異常値（Outlier）動画」と「新規急成長チャンネル」の定量定義とノイズ除去設計**

### **1.1 海外主要リサーチツールの内部ロジック比較と透明性評価**

2025年後半〜2026年現在、海外のYouTubeストラテジストやグロース分析実務家は、絶対再生数ではなく「当該チャンネルの通常期待値に対する相対倍率」であるOutlier Score（異常値スコア）を企画検証の一次指標に据えている。登録者500万人のチャンネルで50万回再生された動画は不発である一方、通常5,000回再生の小規模チャンネルで50万回再生された動画（100倍）は、既存の固定ファン基盤ではなく「企画・タイトル・サムネイル・フォーマット自体」が推薦アルゴリズム上で強い引き（Pull）を生んだ証拠となる。実際、YouTube公式チャンネル（Creator Insider）におけるTodd Beaupré氏の説明として紹介されている通り、現在のレコメンドは集団への一括配信（Push）ではなく、個々の視聴者ごとにクリック・視聴・満足度を予測して動画を引き寄せる（Pull）仕組みであるため、後発チャンネルであっても視聴者単位の勝率が高ければ大型チャンネルと互角以上に拡散できる。  
一方で、YouTube公式に統一されたOutlier Score計算式は存在せず、主要ベンダー間でベースラインの定義・算出窓・フォーマット分離・情報公開度（透明性）は大きく異なる。各ツールの公式ドキュメントおよび第三者比較レビューから確認できた2026年時点の内部仕様を整理すると、以下の通りである。

| ツール名 | 基本スコア定義・ベースライン | 平均 vs 中央値 | 対象ウィンドウ・フォーマット分離 | しきい値・ランク帯 | 主な追加フィルタ・特徴 | ロジック透明性 |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **1of10** | 10万本規模の独自調査では 動画再生数 ÷ チャンネル中央値。同社の実践ガイド記事では手動計算用に直近10〜20本平均も案内 | 調査本体は**中央値**（手動実践ガイドは直近平均） | 直近10〜20本・過去6〜12カ月重視。長尺とShortsを**厳密分離**（「人気順」ソートは歪みの元として非推奨） | 3倍＝注目、5倍以上＝研究・企画検証基準、10倍以上＝大型ブレイク（Shortsの中央値倍率は1.3倍付近、上位は1,000倍超と報告） | 類似タイトル・類似サムネイル検索、3〜5競合でのクロス検証、タイトル/サムネ変更追跡 | 部分的（調査式は公開、本番アルゴリズム細部は非公開） |
| **ViewStats**（MrBeast系） | チャンネルの直近ベースラインに対する倍率＋初動24時間VPH。独自計算式の一次公開はなく、第三者解説により「直近中央値比」「同期間平均比」と解釈が分かれる | 非公開（第三者解説で中央値／平均が混在） | 過去アップロード履歴インデックス型。長尺・Shorts別トラッキング対応 | 競合ベンダー（OutlierKit）の調査記事による色区分報告：黒（≤1倍）、青（2〜5倍）、紫（5〜10倍）、赤（10倍以上） | サムネイルAI類似検索、トップ層のサムネA/Bテスト変更検知、リアルタイム監視 | 限定的（独自式は非公開） |
| **vidIQ** | 公式説明では「再生数・速度（VPH）・同期間内のチャンネル通常ベースライン比」の3要素で算出 | 公式ヘルプ言及は同期間平均ベース（※競合ブログの「標準偏差」記述は公式未確認） | 公開からの経過時間帯を揃えて比較（生涯平均との単純比較を回避）。長尺/Shorts切替あり | 公式ヘルプの視覚区分：2倍未満、2〜5倍、5〜10倍、10倍以上（公式特徴ページに具体数式は非記載） | リアルタイムVPH、登録者規模、動画尺、公開日、画像アップロードによるサムネ類似検索 | 部分的（構成要因のみ公式公開） |
| **Outlier.so / Breakdown Theory / IdeaPhantom** | 対象動画自身をベースラインから除外した同一フォーマット過去動画の中央値比（LOO中央値） | **中央値（明示）** | Breakdown Theoryは同一フォーマット過去最大10本、IdeaPhantomは直近20〜30本長尺 | 2倍＝異常値、5倍＝強異常値、10倍＝例外的異常値（ツール独自慣習） | 計算式が完全公開。比較母数10本未満の少数サンプル警告ロジックを明記 | **非常に高い** |
| **NexLev / TubeLab / TubeFathom** | 異常値スコアに加え、再生数/登録者数・チャンネル開設日数・顔出し有無を統合したニッチ発掘特化型 | 主に事前計算の直近平均／中央値（内部重みは非公開） | 長尺/Shorts別。開設30日未満・6カ月未満・1年未満などの新興フィルタを重視 | NexLev公式MCP指針：≥1倍（平均超）、≥2倍（強ブレイク）。TubeFathom例：Views/Sub \> 20倍かつ登録者1万人未満 | isFaceless/isAiContent判定、48時間再生数、推定RPM（モデル推定値）、類似小規模チャンネル数による機会スコア | 限定的（指標とフィルタは公開） |
| **OutlierKit** | 初動24〜48h速度・持続視聴・エンゲージメント率・登録転換・ニッチ横断比較の多要素スコア（自社説明） | 多要素合成ベースライン | ニッチ横断の同規模チャンネル比較を含む | 3〜5倍＝有望、5〜10倍＝フォーマット突破、10倍以上＝バイラル潜在性 | 小規模チャンネル起点のニッチ検証、台本フック分析、スポンサー追跡 | 部分的 |

この比較から導かれる実装上の最重要原則は、ブラックボックス化した商用ツールの「平均値ベース」や「生涯ベースライン」を自作パイプラインへそのまま持ち込まないことである。とりわけ前述した2025年3月〜2026年11月の3段階にわたるYouTube公開viewCountのカウント拡張により、過去の旧基準動画と最新の自動再生・ホバー・テレビ共視聴込み動画が混在する生涯平均を分母に据えると、最新動画ほど見かけ上の倍率が水増しされる。ベースラインは必ず**直近のローリングウィンドウかつ同一フォーマット内**に厳格限定しなければならない。

### **1.2 異常値スコアの数理的堅牢性と日本・海外市場の収益構造差**

自作Pythonパイプラインでノイズを弾きつつ本物の勝ちパターンだけを抽出するためには、4つの定量指標を連立させて評価する設計が堅牢である。  
第一の核となる指標は、評価対象動画 v 自身を分母から除外するLeave-One-Out 同一フォーマット異常値スコア（OS\_{\\text{LOO}}）である。チャンネル c の同一フォーマット f \\in \\{\\text{Long}, \\text{Shorts}, \\text{Live}\\} に属する直近 N 本（推奨 N=20、下限5本・上限30本、かつ過去12カ月以内で公開後48時間以上経過し初動が落ち着いた動画群）を \\mathcal{W}\_c(f\[span\_8\](start\_span)\[span\_8\](end\_span)) とするとき、次式で定義する。  
OS\_{\\text{LOO}}(v) \= \\frac{V\_v}{\\operatorname{median}\\\!\\left(\\{V\_j : j \\in \\mathcal{W}\_c(f) \\setminus \\{v\\}\\}\\right)}  
ここで V\_v は動画 v の現在再生数である。開設初期チャンネルで比較母数が少ない場合（\|\\mathcal{W}\_c(f) \\setminus \\{v\\}\| \< 10）は1本ごとの振れ幅で中央値が大きく動くため、信頼度フラグ（low\_sample\_confidence \= True）を付与したうえで後述の登録者倍率（VSR）と組み合わせて判断する。  
第二の指標は、公開から数年かけて検索流入で累積した「古参エバーグリーン動画（Search Slow-Burner）」を現行トレンドと誤認しないための時系列瞬間VPH（\\text{VPH}\_{\\text{inst}}）**および**経過日数補正速度（\\text{VPD}\_{\\text{norm}}）である。YouTube動画の視聴数は公開後の経過時間に対してべき乗則または指数減衰的に減速することが複数の学術研究で報告されており、3年前の5万再生よりも公開5日目の2.5万再生の方が現行アルゴリズムからの推薦シグナルは格段に強い。ローカルDBの定期ポーリング（時刻 t\_1, t\_2）から算出する実測VPHと、単発取得時の簡易補正速度を次式で設計する（単発補正式のスムージング定数 \\tau および減衰指数 \\alpha は先行研究の時間減衰概念に基づくパイプライン設計式であり、収集した自ジャンルデータで回帰較正する）。  
\\text{VPH}\_{\\text{inst}}(v, t\_2) \= \\frac{V\_v(t\_2) \- V\_v(t\_1)}{(t\_2 \- t\_1)\_{\\text{hours}}}, \\qquad \\text{VPD}\_{\\text{norm}}(v) \= \\frac{V\_v}{\\left(\\text{AgeDays}\_v \+ \\tau\\right)^{\\alpha}}  
実運用では、公開7〜30日以内の同チャンネル動画群が示す通常VPHに対する倍率（VPH倍率）が3.0倍以上へ急伸した動画を「現行ブレイク中」として検知する運用が有効とされる。  
第三の指標は、既存登録者への依存度を除いた非登録者リーチ力を測る再生数／登録者数倍率（Views-to-Subscriber Ratio: VSR）である。登録者非公開（hiddenSubscriberCount \= true）や極小登録者での発散を防ぐため下限フロア100を設ける。  
\\text{VSR}(v) \= \\frac{V\_v}{\\max(S\_c, 100)}  
第四の指標は、単発の幸運やニュース特需を除外し「後発が再現参入できる穴場ジャンルか」を判定する**クロスチャンネル・ニッチ検証**である。1of10の実践ガイドやTubeFathomの検証モデルに倣い、同一トピック・フォーマット内で登録者数5万人未満（穴場狙いなら1,000〜1万人帯）の独立した複数チャンネル（日本2チャンネル以上、海外英語圏3チャンネル以上）が過去90〜180日以内に OS\_LOO ≥ 5.0 または VSR ≥ 10.0 を達成している場合のみ「再現性のある勝ちジャンル」として承認する。  
さらに、日本市場と海外市場を同一パイプラインで横断探索する際には、算術平均が招く異常値見逃しの問題と、市場ごとの**AdSense RPM（1,000再生あたりクリエイター収益）の構造格差**を同時に踏まえる必要がある。以下の複合検証チャートは、LOO中央値の統計的優位性と主要7カ国のAdSense RPM格差を並置したものである。  
上段のシミュレーション結果が示す通り、小中規模チャンネルの直近20本に過去1本でも50万回級のヒットが混在すると、算術平均ベースラインは通常時の約6,000回から31,310回（対象除外でも30,625回）へ5倍超も歪み、実質7.5倍の明確なブレイク動画（45,000回）がわずか1.44〜1.47倍と判定されてスクリーニングから完全に脱落する。また、開設間もない全5本（通常約3,000回×4本＋新作30,000回）の小標本において対象動画自身を母集団に含めた場合、算術平均は3.57倍へ大きく押し下げられるが、**LOO中央値であれば正確に10.00倍を返す**。したがって、ローカルパイプラインの主指標はLOO中央値で固定し、補助検証として10%トリム平均を併記する実装が統計的に最も妥当である。  
下段の国別AdSense RPMは、Dynamoiが接続チャンネルのYouTube Analytics実績を匿名集計した86市場データ（2025年11月17日〜2026年11月16日）に基づく参考値である。接続チャンネル群の集計でありYouTube公式の国別公表単価ではない点には留意を要するが、オーストラリア（$6.77）・米国（$4.96）・カナダ（$4.78）・英国（3.98）といった英語圏Tier-1市場は、日本（$2.52、86市場中20位）の1.6〜2.7倍の広告単価を示す。他方、AIR Media-Techが300チャンネル（3,595チャンネル月、2025年5月〜2026年5月）を対象に行ったジャンル別調査（Mubert記事経由）によれば、長尺全体のRPM中央値は約$2.30であり、教育・科学が10.22（四分位範囲P25〜P75：2.31〜$19.50）でトップ、キッズ＆ティーンズが米国COPPA法によるパーソナライズ広告制限の影響で$0.33と最下位である[spa{n}_{8}7](star{t}_{s}pan)[spa{n}_{8}7](en{d}_{s}pan)。極めて重要なのは、**ジャンル間の差以上に同一ジャンル内の運営格差が大きい**点である。教育ジャンルの上位25%（$19.50）は下位25%（$2.31）の8.4倍に達し、ガジェット・テックは広告出稿単価（CPM中央値$5.73）が高いにもかかわらず広告表示再生率が34%にとどまるためRPM中央値は$2.33に沈む一方、教育は広告表示再生率77%により高RPMを達成している[spa{n}_{8}8](star{t}_{s}pan)[spa{n}_{8}8](en{d}_{s}pan)。また、「金融・ビジネス系は最高RPM」という通説に対して同調査（ただし3チャンネルの小標本）では中央値2.01（P25〜P75：$0.73〜$5.17）にとどまっており、AIR側は高RPMを誇張する情報商材系の発信バイアスに警鐘を鳴らしている。国内の運用メディアによる推定ではBtoB/SaaS（$5〜$9）や不動産投資（$5〜\$10）が高単価帯とされるものの、トピック名だけで高収益と即断せず、動画尺（8分以上のミッドロール対応）と外部導線の両面で収益性を実測する姿勢が求められる。  
これに対し、2026年10月29日開催のGoogle日本法人「YouTube Brandcast Japan 2026」公式発表（2026年11月報道）では、日本国内の月間利用者数は8,000万人超（18歳以上ネット人口の95%超、Z世代の77%超が毎日Shortsを利用）へ拡大し、視聴者の69%がクリエイター起点の購買を経験、クリエイターへの信頼度は他プラットフォーム平均の1.6倍に達した。さらに国内のショッピング関連動画視聴時間は前年比50%超増となり、2026年2月に楽天市場、2026年9月25日にYahoo\!ショッピング（基本料率2〜4%＋ストア独自特別料率）が「YouTube ショッピング アフィリエイト プログラム」へ相次いで連携した。また米国市場は約2.53億人規模（世界全体では27億人超の月間利用者）の巨大な英語圏視聴基盤を持つ。以上の市場構造差から、本パイプラインでは**海外英語圏向けには「8〜24分尺×教育・解説・顔出しなし（Faceless）×高RPM」によるAdSense＋海外アフィリエイト／有料コミュニティ型**を、**日本市場向けにはAdSense単価の上限を前提に「登録者数千〜数万×高エンゲージメント×LINE/UTAGE/自社商品/YouTubeショッピング導線」を持つ高LTVニッチ**を優先発掘する戦略分岐を採用する。

### **1.3 後発勝機フィルタと「広告ブースト・bot再生・一発屋」を弾くノイズ除外しきい値**

定量スクリーニングの精度を破壊する最大の敵は、再現性のない「偽の異常値（False Positive）」である。具体的には、（1）Google Ads（TrueViewインストリーム広告やYouTubeプロモーション機能）で再生数を購入した動画、（2）外部業者から水増し再生・登録者を買ったチャンネル、（3）単発ニュース・炎上・タイアップによる一過性スパイク、（4）既存テレビ著名人や他SNSからの流入による属人チャンネル、の4種が該当する。  
特にGoogle AdsのTrueViewインストリーム広告は、公式ヘルプの通り「30秒視聴（30秒未満は完視聴）または広告クリック」で公開viewCountへ正規加算されるため、単体動画で50倍超の異常値スコアを容易に発生させる。しかし広告経由や購入再生の視聴者は能動的な高評価やコメントをほとんど残さないため、**同一チャンネル内の通常動画と比べた相対高評価率が極端に崩壊する**。なお、広告再生とオーガニック再生の境界について独立した学術標準ベンチマークやYouTube公式の検知基準は公開されておらず（調査対象だった一部ベンダー大規模集計もアクセス不能だった）、実務では不正再生検知サービス（Bloggers.tools）が公開している経験的リスク指標群と、1of10・TubeFathom・NexLev等の発掘フィルタを組み合わせて運用するのが最も現実的である。以下の一覧では、**一次・ツール由来の根拠しきい値**と、**日米市場規模差を踏まえた本パイプライン推奨設計値**を明確に区別して定義する。

| カテゴリ | 指標名・判定条件 | 計算式・取得ソース | 日本市場（JP）推奨しきい値 | 海外英語圏（Global EN）推奨しきい値 | 根拠区分とノイズ除去意図 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **異常値判定（長尺）** | LOO異常値スコア（OS\_LOO） | V\_v ÷ median(V\_UULF, 直近20本からv除外) | 候補 ≥3.0倍 / 精査 ≥5.0倍 / 大当たり ≥10.0倍 | 候補 ≥3.0倍 / 精査 ≥5.0倍 / 大当たり ≥10.0倍 | **ツール慣習根拠**（1of10・OutlierKit等）。過去バズ1本による偽陰性を排除 |
| **異常値判定（Shorts）** | LOO異常値スコア（Shorts専用） | V\_v ÷ median(V\_UUSH, 直近20本からv除外) | 候補 ≥5.0倍 / 大当たり ≥15.0倍 | 候補 ≥5.0倍 / 大当たり ≥20.0倍 | **パイプライン設計値**。Shortsは倍率分散が極めて広く（1of10報告で中央値1.3倍〜上位1,000倍超）、長尺より厳格化 |
| **非登録者到達力** | 再生数／登録者数倍率（VSR） | V\_v ÷ max(S\_c, 100\) | 最低 ≥3.0倍 / 強ブレイク ≥10.0倍 | 最低 ≥5.0倍 / 強ブレイク ≥15.0〜20.0倍 | **ツール事例＋設計値**（TubeFathom事例で1万登録者未満に対しViews/Sub \> 20倍）。アルゴリズム推薦を証明 |
| **初動・現行勢い** | 瞬間VPH ＆ 公開経過日数 | (V\_t2 \- V\_t1) ÷ Δh（videos.batchGetStats） | 公開 2〜90日、通常VPH比 ≥3.0倍（絶対下限目安 ≥50） | 公開 2〜90日、通常VPH比 ≥3.0倍（絶対下限目安 ≥150） | **VPH倍率≥3.0倍は業界指針**、絶対VPH下限は市場規模差による**パイプライン設計値**。古参検索動画を除外 |
| **後発参入可能性** | 登録者上限 ＆ 実質稼働期間 | S\_c ＆ 現在日 − min(UULF.publishTime) | 500 ≤ S\_c ≤ 50,000、初投稿 ≤365日（超新興 ≤180日）、長尺 5〜60本 | 1,000 ≤ S\_c ≤ 50,000（穴場狙い \<10,000）、初投稿 ≤365日（Shortsは ≤90日） | **ツール事例根拠**（NexLev/TubeFathomの登録者5万/1万未満・開設1年/6カ月/30日未満フィルタ）。休眠転用対策でchannels.publishedAtでなく初動画投稿日を使用 |
| **最低市場規模** | 動画絶対再生数フロア | videos.statistics.viewCount | 長尺 ≥10,000回（高LTV BtoB/LINE系は ≥3,000回許容） | 長尺 ≥30,000回（マイクロニッチ ≥15,000回） | **パイプライン設計値**。通常50回→500回（10倍）といった極小母数ノイズを機械的に除外 |
| **ニッチ再現性** | クロスチャンネル検証 | 同一意味クラスタ内の独立ブレイクch数 | 過去180日以内に S\_c \< 50,000 の**2ch以上**が OS\_LOO ≥ 5倍 | 過去180日以内に S\_c \< 50,000 の**3ch以上**が OS\_LOO ≥ 5倍 | **1of10・TubeFathomの複数検証原則に基づく設計値**。単発ニュース・運・属人依存を排除 |
| **広告・bot再生除外** | 相対高評価率崩壊（最重要） | OS\_LOO ≥ 1.5 かつ V\_v ≥ 1,000 かつ 高評価率 \< チャンネル通常高評価率の40% | **該当時は即時除外**（広告ブースト／購入再生疑い） | **該当時は即時除外**（広告ブースト／購入再生疑い） | **Bloggers.tools公開ルール**。単発動画へのGoogle Ads出稿や購入再生を最も高精度に識別 |
| **広告・bot再生除外** | 絶対エンゲージメント下限 | 高評価率（Likes/Views）、1,000再生あたりコメント数 | 高評価率 \<0.40% 警告（\<0.25% 除外）、コメント/1K \<0.20 警告（\<0.10 除外） | 高評価率 \<0.40% 警告（\<0.25% 除外）、コメント/1K \<0.20 警告（\<0.10 除外） | **Bloggers.tools公開ルール**。広告・bot特有の無反応トラフィック遮断（※コメント無効動画は別扱い） |
| **botパッケージ除外** | 再生・高評価の不自然な均一性 | 直近30本長尺の IQR/Median、高評価率の変動係数（CV） | IQR/Median \<0.35 警告（\<0.20 除外）、Like CV \<0.15 警告（\<0.08 除外） | IQR/Median \<0.35 警告（\<0.20 除外）、Like CV \<0.15 警告（\<0.08 除外） | **Bloggers.tools公開ルール**。自然運用チャンネルは必ずヒットと不発のばらつきを持つ |
| **著名人・買収除外** | 動画あたり登録者 ＆ 登録者あたり累計再生 | TotalViews/Subs；Subs/PublicVideos | TotalViews/Subs \<30（開設1年未満は \<15）で登録者買収疑い；S\_c ≥20万chで Subs/Videos \>10,000（強 \>40,000）は著名人除外 | 同左 | **Bloggers.tools公開ルール**。既存知名度による再現不能な成長と買収アカウントを排除 |

なお、通過した候補群を優先度付けする際の補助的な経験則として、1of10による10万本規模の独自調査（ベンダー観察データであり因果の証明ではない点に注意）は示唆的な傾向を報告している。30分未満の動画では52%超の投稿が12分未満に集中する一方、再生数中央値は**18〜24分**（エンタメ約20分、教育約20〜22分）でピークに達して約24分以降に緩やかに低下する。また、サムネイルにおける「顔出し」が有意な再生数押し上げと相関したのは**登録者20万人超のチャンネルに限られる**と報告されており、登録者5万人未満の後発フェーズにおいて「顔出しなし（Faceless）」フォーマットが構造的ハンデを負いにくいことを示唆している。

## **2\. YouTube Data API v3＋Pythonによる低クォータ自動スクリーニング・導線抽出・不満分析設計**

### **2.1 2026年「細分化クォータ（Granular Quota）」対応のAPI収集パターンと日次スループット設計**

ローカル開発環境でYouTube Data API v3を運用するうえで、2026年6月のクォータ構造刷新への最適化はパイプラインの処理能力を桁違いに左右する。2026年11月現在、Google Cloudプロジェクト（デフォルト無料枠、毎日太平洋時間0:00＝日本時間16:00/17:00リセット）は単一の10,000ユニット枠ではなく、**4つの独立したクォータバケット**で管理されている。

| クォータバケット | 対象メソッド | 日次上限（デフォルト） | 1回あたりコスト | 1リクエスト最大取得件数 | 本パイプラインでの最適用途と必須制約 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Search Queries枠**（2026年6月1日分離） | search.list | **100回 / 日** | 1ユニット（専用枠） | 50件（**合計500件で強制打切り**） | **新規シード探索専用**。一般枠を消費しなくなったが1日100回厳守。チャンネル全動画取得には絶対に使用しない |
| **Batch Stats枠**（2026年6月3日新設） | videos.batchGetStats | **10,000回 / 日** | 1ユニット（専用枠） | 公式ドキュメントに上限未記載（**安全策として50 ID/回**） | **時系列VPH監視の主力**。viewCount, likeCount, commentCount, publishTime, durationMillisを一般枠ゼロ消費で大量取得 |
| **Video Uploads枠**（2026年6月1日分離） | videos.insert | 100回 / 日 | 1ユニット（専用枠） | 1動画 | 本分析パイプラインでは未使用（読取専用） |
| **一般共有プール** | channels.list, playlistItems.list, videos.list, commentThreads.list, channelSections.list 等 | **10,000ユニット / 日** | 読取系はすべて **1ユニット**（※captions.listは50、captions.downloadは200かつ他者動画は取得不可） | channels(id指定)/playlistItems/videosは**50件**、commentThreadsは**100件**（※デフォルト値5/20のまま放置すると10倍浪費） | 追跡チャンネルの動画一覧・詳細メタデータ（概要欄）・コメント収集・芋づる式競合発掘 |

この細分化クォータ構造を最大限に活かす収集設計は、4つの実装パターンを連動させることで成立する。  
第一に、システム自動生成プレイリスト（UULF / UUSH / UULV）を用いた「長尺・Shorts完全分離かつ1ユニット50本取得」である。YouTube Data API v3にはisShortフラグが存在せず、2024年10月15日以降は縦型・正方形かつ**最大3分（180秒）以下**がShorts扱いへ拡張されたため、従来の「60秒以下＝Shorts」という尺判定はもはや機能しない。これに対し、チャンネルID（UC...）の先頭2文字を置換すると、YouTubeの「動画」タブ（長尺のみ＝UULF）、「ショート」タブ（Shortsのみ＝UUSH）、「ライブ」タブ（ライブのみ＝UULV）に相当する自動生成プレイリストIDをAPI消費ゼロで導出でき、playlistItems.list(playlistId="UULF" \+ cid\[2:\], maxResults=50)を一般プール1ユニットで呼ぶだけで純粋な長尺動画50本を一覧取得できる。ただし、UULF/UUSHは公式RESTリファレンス上で永続保証された仕様ではないため、404が返った場合のみ標準のアップロード一覧（UU \+ cid\[2:\]、またはchannels.listのrelatedPlaylists.uploads）へフォールバックし、durationMillis \> 180\_000で安全側に切り分ける二重防御を組み込む。  
第二に、2026年のRSS不安定化を織り込んだ「API主軸・RSS非依存設計」である。以前はクォータゼロで最新15件を取得できるhttps\://www\.youtube.com/feeds/videos.xml?channel\_id=...（またはplaylist\_id=UULF...）を一次ソースとする手法が一般的だったが、2025年12月以降〜2026年11月時点まで毎日UTC 09:00〜12:00前後に404/500エラーが多発し、データセンターIP帯からの制限も報告されている（YouTube公式からの原因説明は出ていない）。一般共有プールが10,000ユニットある現在、2,000チャンネルをplaylistItems.listで1日1回直接ポーリングしても消費は2,000ユニット（20%）に収まるため、RSS障害に振り回されないplaylistItems.list主軸（RSSはUTC障害帯外での任意プリチェック専用、失敗時即APIフォールバック）へ切り替える方が運用安定性は圧倒的に高い。  
第三に、search.listの最小化とchannelSections.listによる芋づる式シード拡張である。search.list専用枠（1日100回）のうち80回を「日本40クエリ＋海外英語圏40クエリ」に配分し、type="video", publishedAfter（過去30日）, videoDuration="medium"/"long", regionCode="JP"/"US", maxResults=50で実行すれば、毎日最大4,000件の新着候補動画と新規チャンネルを掘り起こせる（残り20回は臨時調査やvideoPaidProductPlacement="true"による案件集中ジャンル探索用に温存）。発見した新興有望チャンネルにはchannelSections.list(part="snippet,contentDetails", channelId=...)（1ユニット）を実行し、snippet.type \== "multipleChannels"（おすすめ・姉妹チャンネル棚）を抽出する。62,092チャンネルを対象とした学術調査（First Monday掲載）によれば、おすすめチャンネルの公開率は11.07%にとどまるものの、同一コミュニティ内への接続率（11.95%）は公開登録チャンネル一覧（2.71%）の4.4倍高く、極めて高純度な競合シードとして機能する。さらに概要欄内の@handle言及を抽出してchannels.list(forHandle=...)（1ハンドル1ユニット）で解決すれば、search.list枠を消費せずにニッチ網を拡張できる。  
第四に、videos.batchGetStats専用枠による高頻度VPH監視である。公開30日以内のアクティブ動画20,000本を50件バッチ（400回/巡回）に分割し、3時間ごと（1日8巡回）にポーリングしても消費は**3,200回 / 10,000回（専用枠の32%）に収まり、一般プールを1ユニットも消費せずに1日160,000件の時系列スナップショット**を蓄積できる。この3バケット分離による日次予算と稼働率の全体像を以下に示す。  
ローカル環境のデータ基盤には、SQLite（OLTP：収集状態・クォータ台帳・ジョブキュー・冪等Upsert管理）**と**DuckDB（OLAP：ウィンドウ関数によるLOO中央値・VPH高速集計＋vss拡張によるHNSWローカルベクトル検索）の二層構成を推奨する。両者ともサーバーレス・単一ファイルで同一Pythonプロセスから実行でき、DuckDBのLOAD sqlite; ATTACH 'pipeline.db' AS oltp (TYPE sqlite);によりSQLite上の最新収集テーブルへゼロETLで接続し、分析クエリを10〜100倍高速に処理できる。  
運用・実装にあたっては、**YouTube API Services Developer Policies（2026年9月更新ガイド含む）の厳格な規約境界**をコードレベルで遵守しなければならない。規約上、チャンネル所有者のOAuth認可を得ていない第三者データ（Non-Authorized Data）は**最長30暦日（30 calendar days）を超えて保存できず、30日以内に最新値へ更新（Refresh）するか削除（Delete）する義務**がある。また、複数Google Cloudプロジェクトを作成してクォータを迂回する行為、非公式技術によるデータ取得、YouTube動画・音声データのローカルダウンロードやキャッシュ保存は明示的に禁止されている。さらに、派生指標（Derived Metrics）に関するガイドラインでは、YouTube APIデータのみを用いた単純な四則演算・平均・並べ替えは許容される一方、外部データとの統合、独自スコアの付与、CPM・収益化状況・広告再生の推定などは原則禁止されており、2026年6月1日以降は監査済み開発者がクォータ拡張申請フォームから追加メトリクスおよび長期統計保存の許可を明示申請する運用となっている（なお、公式文書上、個人・社内限定ツールを明示的に免除する条項は記載されていない点に留意し、外部提供やアプリ公開を行う場合は必ずGoogleのコンプライアンス監査と許可取得を先行させるべきである）。技術面のエラー処理では、クォータ超過時のHTTP 403 (reason: quotaExceeded)は失敗リクエスト自体も最低1ユニットを消費するためリトライループを厳禁とし、バケット別のサーキットブレーカーで即時停止させ、ログ出力時にはHttpErrorに含まれるAPIキー付きURLを必ずマスクする。  
以下に、細分化バケット台帳・UULFフォールバック・videos.batchGetStatsバッチ呼び出し・30日TTL管理・安全なエラー処理を備えたPython収集コアの実装骨格を示す。  
`import re`  
`import sqlite3`  
`import logging`  
`from datetime import datetime, timezone, timedelta`  
`from typing import Iterable`  
`from zoneinfo import ZoneInfo`  
`import httpx`  
`from googleapiclient.discovery import build`  
`from googleapiclient.errors import HttpError`

`logger = logging.getLogger(__name__)`  
`API_KEY_RE = re.compile(r"(key=)[^&\s]+")`

`def redact_url(msg: str) -> str:`  
    `return API_KEY_RE.sub(r"\1***REDACTED***", str(msg))`

`class QuotaCircuitOpen(Exception):`  
    `"""Raised when a specific 2026 granular quota bucket hits its safety cap or 403."""`

`class YouTubeQuotaLedger:`  
    `"""Tracks the 3 independent read buckets in SQLite (resets at 00:00 PT)."""`  
    `LIMITS = {"search": 85, "batch_stats": 9000, "general": 8500}`

    `def __init__(self, conn: sqlite3.Connection):`  
        `self.conn = conn`  
        `self.conn.execute("""`  
            `CREATE TABLE IF NOT EXISTS quota_ledger (`  
                `pt_date TEXT, bucket TEXT, units_used INTEGER DEFAULT 0,`  
                `PRIMARY KEY (pt_date, bucket)`  
            `)`  
        `""")`

    `@staticmethod`  
    `def _pt_today() -> str:`  
        `return datetime.now(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d")`

    `def consume(self, bucket: str, units: int = 1) -> None:`  
        `today = self._pt_today()`  
        `cur = self.conn.execute(`  
            `"SELECT units_used FROM quota_ledger WHERE pt_date=? AND bucket=?", (today, bucket)`  
        `).fetchone()`  
        `used = cur[0] if cur else 0`  
        `if used + units > self.LIMITS[bucket]:`  
            `raise QuotaCircuitOpen(f"Bucket '{bucket}' safety limit reached ({used}/{self.LIMITS[bucket]})")`  
        `self.conn.execute("""`  
            `INSERT INTO quota_ledger(pt_date, bucket, units_used) VALUES (?, ?, ?)`  
            `ON CONFLICT(pt_date, bucket) DO UPDATE SET units_used = units_used + excluded.units_used`  
        `""", (today, bucket, units))`  
        `self.conn.commit()`

`class YouTubeCollector2026:`  
    `def __init__(self, api_key: str, conn: sqlite3.Connection):`  
        `self.api_key = api_key`  
        `self.yt = build("youtube", "v3", developerKey=api_key)`  
        `self.ledger = YouTubeQuotaLedger(conn)`  
        `self.http = httpx.Client(timeout=15.0)`

    `def fetch_recent_format_video_ids(self, channel_id: str, fmt: str = "long", max_items: int = 50) -> tuple[list[str], bool]:`  
        `"""Use UULF (long-form) or UUSH (Shorts) prefix for 1-unit format-pure polling; fallback to UU."""`  
        `prefix_map = {"long": "UULF", "shorts": "UUSH", "live": "UULV"}`  
        `target_pl = prefix_map[fmt] + channel_id[2:]`  
        `try:`  
            `return self._fetch_playlist_ids(target_pl, max_items), False`  
        `except HttpError as e:`  
            `if e.resp.status == 404:`  
                `# Fallback to mixed uploads playlist ('UU...'); caller must filter by durationMillis > 180_000 for long-form`  
                `logger.info("Prefix %s unavailable for %s; falling back to UU.", target_pl[:4], channel_id)`  
                `return self._fetch_playlist_ids("UU" + channel_id[2:], max_items), True`  
            `self._handle_http_error(e, "general")`  
            `raise`

    `def _fetch_playlist_ids(self, playlist_id: str, max_items: int) -> list[str]:`  
        `video_ids, page_token = [], None`  
        `while len(video_ids) < max_items:`  
            `self.ledger.consume("general", 1)`  
            `res = self.yt.playlistItems().list(`  
                `part="contentDetails",`  
                `playlistId=playlist_id,`  
                `maxResults=min(50, max_items - len(video_ids)),  # CRITICAL: never leave default=5`  
                `pageToken=page_token,`  
            `).execute()`  
            `video_ids.extend(item["contentDetails"]["videoId"] for item in res.get("items", []))`  
            `page_token = res.get("nextPageToken")`  
            `if not page_token:`  
                `break`  
        `return video_ids`

    `def batch_get_stats_vph(self, video_ids: Iterable[str]) -> list[dict]:`  
        `"""Calls dedicated June 2026 videos.batchGetStats bucket (10,000 calls/day, 0 general units)."""`  
        `ids = list(video_ids)`  
        `results = []`  
        `for i in range(0, len(ids), 50):  # conservative batch size (official max IDs undocumented)`  
            `batch = ids[i:i + 50]`  
            `self.ledger.consume("batch_stats", 1)`  
            `resp = self.http.get(`  
                `"https://www.googleapis.com/youtube/v3/videos:batchGetStats",`  
                `params={"part": "id,snippet,statistics,contentDetails", "id": ",".join(batch), "key": self.api_key},`  
            `)`  
            `if resp.status_code == 403 and "quotaExceeded" in resp.text:`  
                `raise QuotaCircuitOpen("videos.batchGetStats bucket exhausted; halt until 00:00 PT.")`  
            `resp.raise_for_status()`  
            `results.extend(resp.json().get("items", []))`  
        `return results`

    `def _handle_http_error(self, e: HttpError, bucket: str) -> None:`  
        `safe_msg = redact_url(e)`  
        `if e.resp.status == 403 and "quotaExceeded" in str(e):`  
            `logger.error("Quota exceeded on %s: %s", bucket, safe_msg)`  
            `raise QuotaCircuitOpen(f"Bucket {bucket} exhausted") from e`  
        `logger.warning("API error on %s: %s", bucket, safe_msg)`

`def enforce_30day_ttl(conn: sqlite3.Connection) -> int:`  
    `"""Complies with YouTube API Policy 30-calendar-day storage rule for Non-Authorized Data."""`  
    `cutoff = (datetime.now(timezone.utc) - timedelta(days=29)).isoformat()`  
    `cur = conn.execute("DELETE FROM videos_raw WHERE fetched_at < ?", (cutoff,))`  
    `conn.commit()`  
    `return cur.rowcount`

### **2.2 概要欄・リンク展開・SponsorBlockの4信号統合によるマネタイズ導線の自動抽出**

「再生数が伸びているだけでなく、実際にマネタイズが成立しているジャンル・チャンネル」を自動識別するには、videos.listで取得した概要欄テキストと外部リンク先、さらにクラウドソースDBを統合して**収益導線プロファイル**を生成する。日本市場と海外市場では使われるASPやファネルツールが大きく異なるため、以下の4層分類辞書を正規表現・URLパーサーへ組み込む。

| 導線カテゴリ | 日本市場（JP）の主要ドメイン・シグナル | 海外市場（Global EN）の主要ドメイン・シグナル | 推定マネタイズ特性・LTV水準 |
| :---- | :---- | :---- | :---- |
| **1\. アフィリエイト・EC送客** | 主要ASP計測ドメイン：px.a8.net, ck.jp.ap.valuecommerce.com, t.afi-b.com, af.moshimo.com, t.felmat.net, h.accesstrade.net, linksynergy.com, trafficgate.net。Amazonアソシエイト・楽天・Yahoo\!ショッピング等のEC送客リンクおよび2026年連携のYouTubeショッピング言及語（ショッピングタグ, 楽天市場, Yahoo\!ショッピング等） | Impact系（\*.sjv.io）、Geniuslink（geni.us）、Amazon Onelink／Associates、Awin・CJ・Skimlinks・Rakuten・ShareASale系リダイレクト、汎用計測パラメータ（ref=, aff=, via=, utm\_source=youtube等） | 低〜中LTV・高回転型。ガジェット・比較レビュー・生活改善・金融口座比較などで強い収益源 |
| **2\. LINE・メルマガ・ウェビナー導線（高LTVバックエンド）** | 公式LINE・拡張ツール：lin.ee, line.me/R/ti/p, liff.line.me, lstep.app（Lステップ）, s.lmes.jp / step.lme.jp（エルメ）, utage-system.com（UTAGE自動ウェビナー・ファネル）、誘導文脈語（公式LINE, 友だち追加, 無料特典, セミナー, 個別相談） | ニュースレター配信・予約・ファネル構築ツール系URL、および誘導文脈語（newsletter, free guide, book a call, free training, waitlist等の辞書登録） | **最高LTV**。再生数3,000〜1万回台の小規模チャンネルでも高単価バックエンドが成立する国内最重要シグナル |
| **3\. 自社デジタル商品・コミュニティ・ストア** | utage-system.com/members/（会員サイト）、記事販売プラットフォーム（note.com等）や独自EC・デジタル教材販売ページ | skool.com（有料コミュニティ）、stan.store（コース・コーチング・予約一体型ストア）、beacons.ai（デジタル商品・コース・メンバーシップ）、buymeacoffee.com（支援導線）等のクリエイター直販ドメイン | 中〜高LTV・ストック収益型。継続課金や講座販売が機能する教育・スキル・BtoBニッチの証拠 |
| **4\. 企業案件・タイアップ（PR表記＋4信号統合）** | 景品表示法ステマ規制（2023年10月施行、2026年厳格運用）対応表記：【PR】, \#PR, \#広告, \#プロモーション, 提供：, タイアップ, 商品提供を受けて | 米国FTC Endorsement Guides（2023年改定＋2024年10月施行の偽レビュー規則16 CFR Part 465）対応表記：sponsored, advertisement, \#ad, paid link, earn a commission, 割引コード訴求 | 広告主予算の流入証明。同一ジャンルで複数小規模chに案件が入っていればBtoB広告市場が確立済 |

実戦の概要欄では、クリエイターが短縮URLや独自リダイレクトドメイン、あるいはリンク集ページ（linktr.ee, beacons.ai, lnk.bio等）の背後にLINEや自社ストアを配置するケースが極めて多い。これを解き明かすため、概要欄から抽出した未知・短縮ドメインのみをキャッシュ照合したうえで、httpx.AsyncClient(follow\_redirects=True, max\_redirects=6)による非同期HEADリクエスト（405/403時は先頭数KBのみGET）で最終遷移先URLとクエリパラメータ（sid=, pid=, uLand=, utm\_source=等）を解決する。この際、ローカル環境でのSSRF（内部ネットワークIPへのリダイレクト攻撃）を防ぐため、解決前後にプライベートIP帯への接続を拒否するガードを必須とする。さらに遷移先がリンク集サービス（linktr.ee, beacons.ai等）の場合は、公開HTMLや埋め込みJSON（あるいは構造化抽出API）からリンクボタンのラベルと遷移先URLを1ホップ展開することで、表層の概要欄からは見えないLINE登録やコース販売導線を捕捉できる。  
企業案件・自社商品ピッチの検知においては、YouTube Data APIの単一フラグに依存してはならない。videos.listにはpaidProductPlacementDetails.hasPaidProductPlacement（およびsearch.listのvideoPaidProductPlacementフィルタ）が用意されているものの、公式リファレンスでは同フィールドの返却が動画所有者の認証に依存する旨の記載があり（一部第三者ガイドでは公開取得対象として挙げられており実装挙動の齟齬がある）、さらに2026年11月3日にはAPI経由設定がYouTube Studioや視聴者画面へ反映されない障害（Google Issue Tracker \#581064689）が公式確認され、2026年11月16日には未指定時のデフォルトfalse設定も廃止された。なお、案件動画のうち何割が公式チェックボックスを有効化しているかという実証統計はアクセス可能な一次情報からは確認できなかったため、単一信号への依存は網羅率を大きく損なうリスクがある。そこで本パイプラインでは、（a）APIのpaidProductPlacementDetails、（b）日米法規制（景表法・FTC）準拠の概要欄・タイトル表記正規表現、（c）YouTubeクォータゼロで照会できる**SponsorBlock公開API**（SHA-256先頭4文字ハッシュ検索 https\://sponsor.ajay.app/api/skipSegments/{hash4}?service=YouTube\&categories=\["sponsor","selfpromo","interaction"\]）の3信号を統合し、さらに通過した上位動画では（d）第3章のGemini音声・映像解析で口頭・テロップPRを検出する**4信号融合**を採用する。とりわけSponsorBlockのsponsor（企業案件）とselfpromo（自社LINE・商材訴求）は動画内の正確な開始・終了秒数まで取得できるため、概要欄にPR表記が欠落した案件や動画中盤の自社導線ピッチの捕捉に極めて有効である。

### **2.3 コメント欄からの視聴者不満・未解決ニーズ抽出と多言語クラスター分析**

異常値動画と高収益導線を見つけた後発チャンネルが既存動画を上回る企画（Counter-Video）を設計するには、当たり動画のコメント欄に蓄積された**視聴者の疑問・不満・続編要望・購入前の障壁**を定量的にクラスター化することが決定打となる。日本語と英語が混在するローカルパイプラインでは、API収集・事前クレンジング・多言語BERTopic・LLM構造化要約の4工程を直列実行する。  
まず収集工程では、上位異常値動画に対してcommentThreads.list(part="snippet,replies", videoId=..., order="relevance", maxResults=100, textFormat="plainText")を2〜5ページ（200〜500スレッド＝2〜5ユニット）取得する。実装上、キッズ向け（COPPA）や設定オフ動画が返すHTTP 403 commentsDisabledを安全にスキップすること、searchTermsとorder="relevance"の併用は空レスポンスを返す既知のAPI不具合があるため絶対に併用しないこと、インライン返信（replies.comments）は最大5件で打ち切られるためtotalReplyCount \> 5かつ高いいねの疑問スレッドのみcomments.list(parentId=...)で深掘りすること、そして投稿者本人のコメント（authorChannelId \== channelId）を除外することの4点を必ず守る。  
次に、YouTubeコメントの大半を占める「最高でした」「Great video\!」などの低情報量称賛・タイムスタンプ羅列・スパムがクラスタを埋め尽くすのを防ぐため、埋め込み前のフィルタリングを行う。URLや絵文字のみの投稿および短文称賛を除外し、日英の疑問・不満・要望パターン（？, ?, どうやって, 分からない, できない, エラー, 高い, 次回, やってほしい, how do I, doesn't work, too expensive, part 2等）を含むコメントを優先抽出したうえで、視聴者共感度を表す重み w\_i \= \\ln(1 \+ \\text{likeCount}\_i) \+ 0.5 \\cdot \\text{replyCount}\_i を計算する。  
続いて、抽出した高インテント・コメント群を多言語密ベクトルへ埋め込み、BERTopic（UMAP次元削減＋HDBSCAN密度クラスタリング＋c-TF-IDF）でトピック抽出する。HDBSCANはクラスタ数 K を事前指定する必要がなく、どの不満群にも当てはまらないノイズを自動的にトピック-1（外れ値）**へ隔離するため、K-MeansやLDAに比べてSNS短文の意味的一貫性が大幅に高い。日本語コメントは英語と異なりスペース区切りでないため、BERTopicのCountVectorizerへ**SudachiPy（複合語の粒度がバランスの良いMode B）またはfugashi（MeCab＋unidic-lite）をカスタムトークナイザーとして渡し、名詞・動詞・形容詞を中心にc-TF-IDFを算出する点が日本語精度を左右する。埋め込みモデルの選定比較は以下の通りである。

| 埋め込みモデル | 実行環境・対応モダリティ | 出力次元・正規化仕様 | API単価（参考値）・備考 | パイプライン内の推奨用途 |
| :---- | :---- | :---- | :---- | :---- |
| **gemini-embedding-2** | Gemini API / 100言語超・マルチモーダル（テキスト・画像・音声・動画・PDF、最大8,192 tok） | 最大3072次元（Matryoshka圧縮で768/1536等に対応、**自動L2正規化あり**） | テキスト0.20/1M（Batch $0.10/1M）、画像$0.45/1M（約0.00012/枚）。Free枠あり（※第三者料金追跡・技術解説値）。10万コメント（平均60 tok＝6M tok）で**標準\$1.20・Batch \$0.60**、サムネ5,000枚で\$0.60（Batch \$0.30） | **本命推奨**。task\_type引数非対応のため入力先頭に"task: clustering \| query: {text}"を付与。将来的にDuckDB vss上でコメントと類似サムネを同一空間検索可能 |
| **gemini-embedding-001** | Gemini API / テキスト専用 | 最大3072次元（圧縮時は**手動L2正規化が必須**） | テキスト\$0.15/1M（Batch 0.075/1M；第三者解説値）\[span\_252\](start\_span)\[span\_252\](end\_span)\[span\_253\](start\_span)\[span\_253\](end\_span)。10万コメントで0.90。**v2とはベクトル空間が非互換**（移行時は全件再埋込必須） | 純テキスト最安構成。EmbedContentConfig(task\_type="CLUSTERING")を利用 |
| **BAAI/bge-m3 / multilingual-e5-large** | 完全ローカル実行（OSS・GPU/MPS推奨）/ 多言語テキスト | 1024次元（bge-m3は最大8,192 tok対応） | APIコスト\$0。日英多言語クラスタリング・検索ベンチマークで高い実績 | API費用ゼロ運用や大量オフラインバッチ処理時のローカル代替 |

最終工程として、c-TF-IDFのキーワード羅列だけでは企画判断に直結しにくいため、LLM-Guided Representationを導入する。有効な各クラスタ（topic\_id \!= \-1）から重み w\_i 上位15件の代表コメントとc-TF-IDF語群を抽出し、gemini-3.5-flash-lite（またはgemini-3.8-flash）へ構造化JSON出力で渡すことで、（a）視聴者ペインの要約ラベル、（b）既存当たり動画が説明し切れていない欠落点、（c）後発がそのまま制作できる「上位互換・カウンター動画タイトル案」、（d）LINE無料特典や有料講座へ転換できる需要強度（クラスタ件数×平均いいね数）を自動生成する。

## **3\. Gemini API（YouTube URLネイティブ解析）による「勝ちパターン抽出スキーマ」とコスト最適化設計**

### **3.1 2026年後半のGemini動画解析仕様と「Two-Pass Static Hybrid」戦略**

第1〜2章を通過した「本物の当たり動画」を再現可能な制作仕様書へ落とす最終工程が、**Gemini APIのYouTube URLネイティブ解析**である。公式YouTube Data APIのcaptions.downloadは自分が編集権限を持つ動画以外では利用できず、また第三者ツールによるローカル動画ダウンロードはYouTube規約違反リスクを伴う。これに対し、Gemini API（google-genai Python SDK）は公開YouTube URLをそのままuriとして入力でき、映像と音声をネイティブに同時理解するため、文字起こしだけでは欠落する**カット間隔・テロップ設計・B-roll切替・話者の感情変化・効果音（SFX）・BGM転調**まで一括抽出できる。  
ただし、2026年11月現在のGemini動画解析仕様と課金挙動には、本番運用の採算性を左右する重要制約がある。第一に、YouTube URL入力は**公開（Public）動画のみ**に対応しており、非公開・限定公開・年齢制限・地域制限動画はエラーとなる。実運用では特定動画へのHTTP 403 PERMISSION\_DENI\[span\_268\](start\_span)\[span\_268\](end\_span)EDがコンテンツ由来で発生し得るため、APIキー全体の認証エラーと混同せず動画単体をスキップする例外分離が不可欠である。日次制限はFree Tierが合計8時間/日、Paid Tierは動画長ベースの上限なし、1リクエスト最大10本（Gemini 2.5以降）だが、タイムスタンプ精度を保つため**1リクエスト1動画**（映像パートの後にテキスト指示を配置）を基本とする。また、YouTube URL直渡し機能は2026年11月時点で公式ドキュメント上**Preview扱い**（追加URL取り込み課金なし、将来価格・レート制限変更の可能性あり）である点に留意する。  
第二に、Staticモード（デフォルト）のトークン計算仕様である。デフォルトの1 FPSサンプリング時、映像はmedia\_reso\[span\_269\](start\_span)\[span\_269\](end\_span)lution="low"で**66トークン/フレーム**、標準/highで**258トークン/フレーム**、音声はFPS変更の影響を受けず**32トークン/秒**（単一チャンネル変換、非音声SFXや感情も認識）として計算され、メタデータ込みで低解像度約100トークン/秒（1Mコンテキストで最長3時間）、高解像度約300トークン/秒（最長1時間）となる。  
第三に、StaticモードとAgenticモードの使い分けである。Gemini 4シリーズ（Carbon/Argon/Hydrogen）およびGemini 3.8 Flash / 3.6 Flash / 3.5 Flash-Liteは、モデルが自律的にタイムラインを探索する**Agentic動画処理**（Gemini Developer APIでは"processing": "agentic"）に対応し、公式ドキュメントでは長尺動画で最大88%のトークン削減と約7%の品質向上が謳われている。しかし2026年9月のGoogle Developer Expertによる実装検証（Vertex AI環境での検証報告）では、重大な運用リスクが明らかになった。Vertex AIで4条件（api\_version="v1beta1", media\_processing="AGENTIC", 対応モデル, thinking\_level明示）やgoogle-genai \>= 2.20.0を1つでも欠くと、エラーを出さず200 OKでStaticへ**サイレント・フォールバック**して高額課金を招く。さらに、思考トークン（total\_thought\_tokens）は入力単価の5〜8.3倍高額な**出力単価**で課金されるうえ、サーバー側非決定性によりthinking\_level="LOW"でも突然35,000トークン超（2時間動画で最大359,961トークン）へ暴騰し1コールあたりコストが最大60倍へ跳ね上がる事例が報告されている。加えて、**カスタムfpsおよびstart\_offset/end\_offsetによる区間切り出しはStaticモード専用**であり、Agenticモードでは併用できない。  
こうした仕様とリスクを踏まえ、冒頭60秒の1〜2秒刻みのカット割りやテロップ文字を高精度に読み取りつつ、20分超の本編構成と音声演出を低コスト・ゼロスパイクで解析するため、本パイプラインでは「Two-Pass Static Hybrid（2パス静的ハイブリッド）方式」を標準採用する。

> 1. **Pass 1（冒頭マイクロ演出解析：0s〜60s）：** Staticモードでstart\_offset="0s", end\_offset="60s", fps=2.0（0.5秒間隔）, media\_resolution="high"を指定する。高速カットやテロップの視認性・配置を逃さず捕捉でき、理論入力は**33,480トークン**（60秒×\[258×2＋32＋10\]）に収まる。  
> 2. **Pass 2（全編マクロ構成・音声演出解析：0s〜終了）：** Staticモードでfps=0.5（2秒に1フレーム）, media\_resolution="low"を指定する。画面トークンを1 FPS高解像度比で約8分の1（33トークン/秒）へ抑えつつ音声は劣化なくフル（32トークン/秒）で投入されるため、2〜3分ごとのリフック・オープンループ・BGM転換・案件挿入・エンディング構成を理論値**67トークン/秒**（20分動画で80,400トークン）で解析できる。なお、3分以下のShortsはPass 1単発（最大60秒または全尺）で完結させ、45分〜2時間超のポッドキャスト系のみ特定箇所抽出用としてAgenticモードを選択適用する。

ここで実装上の重要な検証ポイントがある。上記のTwo-Passトークン試算は映像トークンがfpsに比例して増減する前提（第三者解説でも同様の比例計算が示されている）に基づくが、googleapis/python-genaiのGitHub Issue \#2019において「video\_metadataでfpsを変更しても消費動画トークン数が変わらなかった」という報告も存在している。したがって、ローカル環境で初回バッチを回す際は必ずcount\_tokensまたはレスポンスのusage\_metadataで実消費トークンを検証すること。仮にfps=0.5の割引が効かず1 FPS低解像度（100トークン/秒）で課金された場合でも、20分動画のPass 2は120,000トークンにとどまり、全編1 FPS高解像度（360,000トークン）と比べて依然約60%以上のコスト削減効果を維持できる。  
2026年11月時点の料金体系および予定価格改定（2026年12月1日のgemini-4-argon/carbon倍額化、2027年1月1日のgemini-3.8-flash/3.6-flash倍額化）を反映した、**20分尺の当たり動画100本**の解析総コスト比較を以下に示す。

| モデルID（2026年11月現行） | コンテキスト / Agentic対応 | 標準入力 / 出力単価（per 1M tok） | Batch 50%割引単価（per 1M tok） | 予定価格改定・Free枠・推奨役割 |
| :---- | :---- | :---- | :---- | :---- |
| gemini-3.5-flash-lite | 1M / 対応 | \$0.30 / \$2.50（※第三者料金追跡・開発者報告値） | 対応時50%割引想定（公式Batch表は要確認） | 大量動画の一次構造化・コメント代表ラベル生成の**最安主力** |
| gemini-3.8-flash | 1M / 対応 | \$0.75 / \$3.75（2026年末迄、公式確認） | \$0.375 / \$1.875（2026年末迄、第三者追跡＋Batch 50%原則） | **2027年1月1日より倍額**（$1.50/$7.50）。Free枠あり。複雑演出・日本語ニュアンス解析のバランス最強 |
| gemini-4-hydrogen | 1M / 対応 | \$1.50 / \$7.50（公式確認） | **\$0.75 / \$3.75**（公式確認） | Free枠あり（Google製品改善に利用）。2027年以降は3.8 Flashと同単価帯のため**次世代主力の本命** |
| gemini-4-argon / carbon | 1M / 対応 | \$2.00 / \$10.00（11月30日迄）→ **\$4.00 / \$20.00**（12月1日〜、公式確認） | \$2.00 / \$10.00（12月1日〜、公式確認） | Free枠なし。最上位当たり動画10〜20本の最終企画分解・台本リバースエンジニアリング専用 |

### **3.2 再現可能な演出仕様を抽出する構造化JSONスキーマ（Pydantic実装仕様）**

Gemini APIのStructured Outputs（response\_format＋Pydantic model\_json\_schema()）を用いて動画から再現可能な演出仕様を安定抽出するためには、**維持率エンジニアリングのドメイン要件**と**Geminiの有限状態機械（FSM）制約**の双方を満たすスキーマ設計が求められる。  
ドメイン面では、George BlackmanやPaddy Gallowayの台本設計論、YouTube公式（Creator Insider）の満足度指針、さらにPixflow・Storyy・Opus等の編集ベンチマーク（業界ガイド値としてDatabox集計の確立チャンネル平均維持率約30%・強水準50〜60%等が報告されている）から、以下の8領域の定量・構造要素を漏れなく組み込む。すなわち、（1）冒頭0〜7秒（特に5秒以内）で挨拶や5秒超のブランドロゴを排し、タイトル・サムネイルの約束を視覚・音声で確証しているか、（2）Blackmanの3部フック構造（共感導入Context Lean-in → 逆接Scroll Stop → 常識を覆すContrarian Snapback）と損失回避フレームの有無、（3）視聴離脱の過半が起きる初動1分を突破するための**25〜35秒時点での第1パターンインタラプト**、（4）冒頭1分のカット間隔（1〜5秒）と本編の平均ショット長（ASL：業界目安4〜7秒、ただし35歳以上向け層での過剰編集回避）、（5）**30〜60秒ごとの視覚・音変化**と**2〜3分ごとのリフック＆オープンループ**（長尺の自然離脱点とされる4分・9分・18分付近の仕掛け含む）、およびCreator Insiderが満足度毀損の主因として警告する「開いたループの誠実な回収有無（is\_closed）」、（6）Jカット・Lカット・無音削除（No Flat Landings）・SFX同期・BGM章転換の音響編集、（7）CTA（5秒未満・最高価値提供直後に中盤配置）およびスポンサー/導線ブリッジ（ループ未解決のリフック直後に挿入）、（8）「まとめると」「最後に」などの離脱合図語を排除しラスト20秒まで価値提供を継続するエンディング（ShortsではPaddy Gallowayによる33億本分析で示唆された初動3秒VVSA 70〜90%を狙う停止フックと末尾→冒頭のシームレスループ） である。  
技術面では、Gemini APIがJSON Schemaを有限状態機械（FSM）へコンパイルしてトークン生成を制約する仕様上、深いネスト・多数のオプション項目・複雑なanyOfユニオン・巨大なenum配列・冗長なキー名は状態爆発を起こし400 INVALID\_ARGUMENTエラーを誘発する。また、文字列のminLength/maxLengthや配列のuniqueItemsはAPI側で自動除去されて強制されない一方、配列のminItems/maxItemsはAPI側で強制される（ただし不要な境界は状態数を増やすため最小限にとどめ、詳細検証はクライアント側Pydanticのmodel\_validate\_json()で行うのが公式推奨である）。このため本設計では**Pass 1用（HookMicroSpec）とPass 2用（MacroWinningBlueprint）にスキーマを2分割**し、ネスト最大2層・全プロパティ必須（欠損時はnull許容）・6〜8値以下のコンパクトなLiteral列挙型で設計した。

| 解析パス | スキーマ領域 | 抽出する具体項目（JSONキー） | 動画・音声からの観察対象と再現上の意味 |
| :---- | :---- | :---- | :---- |
| **Pass 1**（0〜60秒 / 2FPS高解像度） | クリック確証・導入速度 | click\_confirm\_sec, has\_greeting\_or\_logo\_waste | 0〜7秒以内に挨拶・5秒超ロゴ抜きでタイトル約束を視覚・音声確証しているか |
| **Pass 1** | フック心理・台本構造 | hook\_format, uses\_negative\_stakes, context\_lean\_in, scroll\_stop\_pivot, contrarian\_snapback, opening\_curiosity\_loop | Blackman 3部構成・損失回避フレーミング・冒頭30秒以内の新奇好奇心ループの言語化 |
| **Pass 1** | 冒頭視覚ペース・テロップ | cut\_count\_0\_60s, avg\_shot\_len\_sec, first\_interrupt\_sec, telop\_style | 冒頭60秒の実測カット数とASL、25〜35秒の第1パターンインタラプト位置、スマホ視認テロップ仕様 |
| **Pass 1** | 冒頭音響・Shorts特化 | opening\_sfx\_present, vocal\_energy\_level, shorts\_seamless\_loop | 初動15秒以内の意図的SFX、発話エネルギー・声質分類、Shortsの末尾→冒頭シームレスループ |
| **Pass 2**（全編 / 0.5FPS低解像度） | 物語構造・フォーマット | content\_format, structural\_roadmap\_shown | 解説・検証・ケーススタディ分類、導入部での全体地図提示（待機心理の緩和） |
| **Pass 2** | オープンループ＆リフック台帳 | open\_loops\[\]（opened\_at, hook\_question, closed\_at, is\_closed） | 2〜3分周期のリフックと**全ループの回収率検証**（未回収釣りによる満足度低下の防止） |
| **Pass 2** | 映像レイヤー・編集文法 | body\_avg\_shot\_len\_sec, pattern\_interrupt\_interval\_sec, visual\_dominant\_layer | 本編ASL（4〜7秒基準）、30〜60秒の場面転換周期、主映像レイヤー（顔出し／B-roll／画面録画／図解） |
| **Pass 2** | 音声・BGM・無音処理 | bgm\_shift\_count, dead\_air\_eliminated, uses\_j\_l\_cuts | 章転換でのBGM切替回数、無音・言い淀みカット徹底度、J/Lカットによる滑らかな場面繋ぎ |
| **Pass 2** | 収益導線・CTA・離脱防止 | monetization\_ctas\[\]（timestamp, cta\_type, duration\_sec, placement\_context, bridge\_script\_summary）, has\_finalizing\_phrase, end\_screen\_continuous\_value\[span\_308\](start\_span)\[span\_308\](end\_span) | 中盤5秒未満CTA・リフック直後の案件/LINE誘導橋渡し・終了合図語の有無・ラスト20秒継続 |
| **Pass 2** | 後発再現性評価 | faceless\_reproducible, production\_effort\_tier, replicable\_winning\_formula | 顔出し・大型ロケ不要で後発がテンプレート転用できる再現性の構造化評価 |

以下に、最新のgoogle-genai Python SDK（client.interactions.create＋response\_format）を用いたTwo-Pass Static Hybrid解析の実装コードとPydantic v2スキーマ定義を示す。  
`from typing import Literal, Optional`  
`from pydantic import BaseModel, Field`  
`from google import genai`  
`from google.genai.errors import APIError`

`# ==============================================================================`  
`# PASS 1 SCHEMA: 冒頭60秒マイクロ演出仕様 (2.0 FPS / High Resolution)`  
`# FSM状態爆発を防ぐためフラット構造・全フィールドrequired(nullable許容)・小enumで構成`  
`# ==============================================================================`  
`class HookMicroSpec(BaseModel):`  
    `click_confirm_sec: float = Field(`  
        `description="タイトル・サムネイルの約束を映像または発言で初確認した秒数(0-60)。未達なら60.0"`  
    `)`  
    `has_greeting_or_logo_waste: bool = Field(`  
        `description="冒頭10秒以内に『こんにちは/Hey guys』等の不要な挨拶や5秒超のロゴOPがあるか"`  
    `)`  
    `hook_format: Literal[`  
        `"direct_value", "highlights_teaser", "cold_open", "bold_claim", "question", "other"`  
    `] = Field(description="冒頭フックの編集・導入フォーマット分類")`  
    `uses_negative_stakes: bool = Field(`  
        `description="損失回避・失敗警告・危機感などネガティブフレームで視聴理由を提示しているか"`  
    `)`  
    `context_lean_in: str = Field(description="視聴者の共感・前提を引き込む冒頭フレーズ要約")`  
    `scroll_stop_pivot: Optional[str] = Field(`  
        `description="『しかし/But/実は』等の逆接転換フレーズ。無ければnull"`  
    `)`  
    `contrarian_snapback: Optional[str] = Field(`  
        `description="常識を覆す予想外の主張・結論フック。無ければnull"`  
    `)`  
    `opening_curiosity_loop: str = Field(`  
        `description="冒頭30秒以内に開かれた、本編最後まで見させるための未解決の疑問・約束"`  
    `)`  
    `cut_count_0_60s: int = Field(ge=0, description="0〜60秒間（または動画全体）の視覚的カット/画面切替回数")`  
    `avg_shot_len_sec: float = Field(gt=0.0, description="冒頭区間の平均ショット長（秒）")`  
    `first_interrupt_sec: Optional[float] = Field(`  
        `description="最初の明確なパターンインタラプト（B-roll/ズーム/図解/音転換）の秒数"`  
    `)`  
    `telop_style: Literal["none", "minimal_keyword", "full_subtitle", "kinetic_highlight", "mixed"] = Field(`  
        `description="画面内テロップの設計スタイル"`  
    `)`  
    `opening_sfx_present: bool = Field(description="冒頭15秒以内にwhoosh/pop/impact等の意図的効果音があるか")`  
    `vocal_energy_level: Literal["calm_authority", "conversational", "high_energy", "dramatic", "tts_ai"] = Field(`  
        `description="ナレーション・話者の声のトーンとエネルギー分類"`  
    `)`  
    `shorts_seamless_loop: Optional[bool] = Field(`  
        `description="Shorts動画の場合、末尾から冒頭へ自然につながるループ構造か。長尺はnull"`  
    `)`

`# ==============================================================================`  
`# PASS 2 SCHEMA: 全編マクロ構成・ループ回収・収益導線仕様 (0.5 FPS / Low Res)`  
`# ==============================================================================`  
`class OpenLoopItem(BaseModel):`  
    `opened_at: str = Field(description="ループを開いたタイムスタンプ MM:SS")`  
    `hook_question: str = Field(description="視聴者に提示した疑問・予告・リフック内容")`  
    `closed_at: Optional[str] = Field(description="答えを回収したタイムスタンプ MM:SS。未回収ならnull")`  
    `is_closed: bool = Field(description="動画内で誠実に回収されたか")`

`class MonetizationCTAItem(BaseModel):`  
    `timestamp: str = Field(description="訴求開始タイムスタンプ MM:SS")`  
    `cta_type: Literal[`  
        `"subscribe_like", "line_email_lead", "affiliate_shopping", "sponsor_read", "owned_product", "next_video"`  
    `] = Field(description="CTA・マネタイズ導線の種別")`  
    `duration_sec: int = Field(ge=0, description="訴求にかけた概算秒数")`  
    `placement_context: Literal["after_rehook", "after_value_peak", "flat_transition", "end_screen"] = Field(`  
        `description="挿入直前の文脈（リフック直後／価値提供直後／話の切れ目／終了画面）"`  
    `)`  
    `bridge_script_summary: str = Field(description="本編内容から導線・案件へ自然に接続したトークの型")`

`class MacroWinningBlueprint(BaseModel):`  
    `content_format: Literal[`  
        `"tutorial", "case_study", "explainer_essay", "comparison_review", "challenge_vlog", "listicle"`  
    `] = Field(description="動画全体の主フォーマット")`  
    `structural_roadmap_shown: bool = Field(`  
        `description="冒頭〜導入部で動画の全体章立て・ステップ数を視覚提示しているか"`  
    `)`  
    `body_avg_shot_len_sec: float = Field(gt=0.0, description="本編全体の推定平均視覚変化間隔（秒）")`  
    `pattern_interrupt_interval_sec: float = Field(gt=0.0, description="大きな場面・図解・演出転換の平均間隔（秒）")`  
    `visual_dominant_layer: Literal[`  
        `"talking_head", "broll_stock", "screen_capture", "slides_motion_gfx", "faceless_ai_mixed"`  
    `] = Field(description="本編で最も占有率が高い映像レイヤー")`  
    `bgm_shift_count: int = Field(ge=0, description="章転換や感情変化に伴うBGMトラック切替・停止の回数")`  
    `dead_air_eliminated: bool = Field(description="発話間の不要な無音・言い淀みが徹底カットされているか")`  
    `uses_j_l_cuts: bool = Field(description="音声先行・映像先行（J/Lカット）による滑らかな場面繋ぎを使っているか")`  
    `open_loops: list[OpenLoopItem] = Field(`  
        `max_length=12, description="動画内で仕掛けられた主要なオープンループ・リフック一覧（最大12件）"`  
    `)`  
    `monetization_ctas: list[MonetizationCTAItem] = Field(`  
        `max_length=10, description="動画内で言及・表示された全CTA・PR・LINE・商品導線一覧（最大10件）"`  
    `)`  
    `has_finalizing_phrase: bool = Field(`  
        `description="終盤に『まとめると/最後に/to recap』など視聴離脱を誘発する終了合図語があるか"`  
    `)`  
    `end_screen_continuous_value: bool = Field(`  
        `description="ラスト20秒で次動画への強烈な橋渡しまたは価値提供を継続しているか"`  
    `)`  
    `faceless_reproducible: bool = Field(`  
        `description="顔出し・高額ロケなしで後発クリエイターが再現可能な構成か"`  
    `)`  
    `production_effort_tier: Literal["low_template", "medium_editorial", "high_cinematic"] = Field(`  
        `description="制作工数・編集難易度の段階"`  
    `)`  
    `replicable_winning_formula: str = Field(`  
        `description="他ジャンルへ横展開するための再現可能な『勝ちパターン設計式』の簡潔な要約"`  
    `)`

`def analyze_outlier_video_two_pass(`  
    `youtube_url: str,`  
    `duration_sec: int,`  
    `model: str = "gemini-3.8-flash",`  
`) -> dict:`  
    `"""Executes Two-Pass Static Hybrid analysis with graceful per-video 403 isolation."""`  
    `client = genai.Client()`  
    `is_short = duration_sec <= 180`  
    `pass1_end = f"{min(60, duration_sec)}s"`

    `try:`  
        `# PASS 1: 冒頭60秒（2.0 FPS / High Res）— 映像の後にテキスト指示を配置`  
        `p1_resp = client.interactions.create(`  
            `model=model,`  
            `input=[`  
                `{`  
                    `"type": "video",`  
                    `"uri": youtube_url,`  
                    `"media_resolution": "high",`  
                    `"processing": {"type": "static", "start_offset": "0s", "end_offset": pass1_end, "fps": 2.0},`  
                `},`  
                `{`  
                    `"type": "text",`  
                    `"text": (`  
                        `"YouTubeのトップ視聴維持率アナリストとして、この動画の冒頭区間を映像（カット・テロップ・図解）"`  
                        `"と音声（発話内容・声の抑揚・効果音・BGM）の両面から厳密に分解し、指定JSONスキーマで出力せよ。"`  
                    `),`  
                `},`  
            `],`  
            `response_format={`  
                `"type": "text",`  
                `"mime_type": "application/json",`  
                `"schema": HookMicroSpec.model_json_schema(),`  
            `},`  
        `)`  
        `hook_spec = HookMicroSpec.model_validate_json(p1_resp.output_text)`

        `macro_spec = None`  
        `if not is_short:`  
            `# PASS 2: 全編（0.5 FPS / Low Res + フル音声）`  
            `p2_resp = client.interactions.create(`  
                `model=model,`  
                `input=[`  
                    `{`  
                        `"type": "video",`  
                        `"uri": youtube_url,`  
                        `"media_resolution": "low",`  
                        `"processing": {"type": "static", "fps": 0.5},`  
                    `},`  
                    `{`  
                        `"type": "text",`  
                        `"text": (`  
                            `"この長尺動画の全編について、オープンループの開閉と回収有無、リフック周期、映像レイヤー比率、"`  
                            `"BGM転換、CTA/案件/LINE導線の挿入文脈、終盤の離脱防止設計を厳密に分析しJSONで出力せよ。"`  
                        `),`  
                    `},`  
                `],`  
                `response_format={`  
                    `"type": "text",`  
                    `"mime_type": "application/json",`  
                    `"schema": MacroWinningBlueprint.model_json_schema(),`  
                `},`  
            `)`  
            `macro_spec = MacroWinningBlueprint.model_validate_json(p2_resp.output_text)`

        `return {`  
            `"status": "ok",`  
            `"youtube_url": youtube_url,`  
            `"hook_micro": hook_spec.model_dump(),`  
            `"macro_blueprint": macro_spec.model_dump() if macro_spec else None,`  
        `}`  
    `except APIError as e:`  
        `# 非公開化・年齢制限・地域制限による400/403は動画単体のスキップとして隔離する`  
        `if getattr(e, "code", None) in (400, 403):`  
            `return {"status": "skipped_video_restricted", "youtube_url": youtube_url, "reason": str(e)}`  
        `raise`

## **4\. ローカル実装ロードマップと2026年後半リスク管理チェックリスト**

本パイプラインを最小の初期工数で立ち上げ、日本市場・海外市場の双方で確実に成果（勝てる穴場ジャンルと再現テンプレートの特定）へ結びつけるための3段階導入手順は以下の通りである。

> 1. **Phase 1（Week 1：低クォータ基盤＆異常値・VPHエンジン構築）：** SQLite＋DuckDB環境を構築し、YouTubeQuotaLedger・UULF/UUSHフォールバック収集・videos.batchGetStatsによる3時間毎VPH監視・LOO中央値＋広告再生除外フィルタ（相対高評価率\<40%ルール等）を稼働させる。まずは日英各20クエリ・追跡500チャンネルで1週間試験稼働し、偽陽性率とbatchGetStatsの安定バッチ上限を確認しながらしきい値を較正する。  
> 2. **Phase 2（Week 2：高収益導線抽出＆コメント不満クラスター稼働）：** 概要欄の4層マネタイズ辞書・非同期httpxリダイレクト展開（SSRFガード付き）・SponsorBlockハッシュ照会を実装し、チャンネル単位の「収益導線プロファイル（LINE/UTAGE型・Skool/コース型・楽天/Yahoo\!ショッピング型・案件集中型）」を自動付与する。続いて上位異常値動画30〜50本からcommentThreads.listでコメントを抽出し、gemini-embedding-2（768次元）またはローカルBAAI/bge-m3＋SudachiPy対応BERTopic＋LLM要約で「未解決ペイン×カウンター動画企画リスト」を自動出力する。  
> 3. **Phase 3（Week 3〜：Gemini Two-Pass動画解析＆クロスチャンネル勝ちパターンDB化）：** Phase 1〜2の総合スコア上位（クロスチャンネル検証済み＋高収益導線あり）の当たり動画のみを厳選し、初回はusage\_metadataでfps指定時の実課金トークンを検証したうえで、Batch API（50%割引）によるTwo-Pass Static Hybrid解析へ投入する。抽出されたHookMicroSpecおよびMacroWinningBlueprintのJSONをDuckDBへ格納し、「登録者5万人未満×10倍超ブレイク×Faceless再現可」に共通する冒頭秒数・カット間隔・オープンループ回収率・CTA配置をSQL集計して制作テンプレートを生成する。

| リスク領域 | 2026年後半時点の具体リスク | パイプライン側の必須防御策 |
| :---- | :---- | :---- |
| **YouTube API規約・データ保持・派生指標** | 第三者データ（Non-Authorized Data）の30暦日超保存違反、動画ファイルのローカル保存違反、無認可の独自スコア・外部結合データ提供（規約に個人ツール免除の明記なし） | enforce\_30day\_ttl()の毎日定時実行（29日基準で自動更新または削除）。ローカル動画DLを完全廃止しGemini YouTube URL直渡しに統一。第三者提供や商用SaaS化を行う場合は2026年6月以降の監査・拡張申請フォームで事前承認を取得 |
| **再生数定義変更による統計歪み** | 2025年3月（Shorts）・2026年8月27日（全動画1フレーム目・自動再生・ホバー）・2026年11月16日（テレビCo-views合算）によるviewCountの構造的インフレ | 生涯平均を完全廃止し、直近10〜20本かつ同一フォーマット（UULF/UUSH分離）のLOO中央値のみを使用。2026年8月以前と以降の動画を同一窓で比較する場合は公開日コホート区分を併用 |
| **Gemini API価格改定・Preview変動・課金挙動** | 2026年12月1日（Gemini 4 Argon/Carbon倍額）、2027年1月1日（3.8/3.6 Flash倍額）、YouTube URL機能のPreview終了、Agentic思考トークン暴騰、fps指定時のトークン削減未反映報告 | モデルIDを設定ファイル外出しとし、gemini-3.5-flash-lite＋gemini-4-hydrogen（Batch 50%割引）へ即時切替可能にする。Two-Pass Static Hybridを既定とし、初回実行でusage\_metadataの実トークンを実測監視・日次予算上限アラートを設定 |
| **外部依存の可用性・API不具合** | YouTube RSSの毎日UTC 09:00〜12:00帯404障害、API paidProductPlacementDetailsの反映不具合（Issue \#581064689）、非公開・地域制限動画によるGemini 403 | RSS非依存のplaylistItems.list主軸設計、案件検知の4信号融合（API＋日米法規制表記＋SponsorBlock＋Gemini音声）、動画単位の403隔離とクォータバケット別サーキットブレーカーを標準搭載 |
| **自社発信時の法務コンプライアンス** | 発掘した高収益導線を自社チャンネルへ適用する際、日本の景品表示法ステマ規制や米国FTC Endorsement Guides（偽レビュー禁止16 CFR Part 465含む）に抵触するリスク | YouTube Studioの有料プロモーション設定に加え、動画冒頭の口頭＋テロップ告知および概要欄ファーストビューへの明瞭な日本語「\#PR」「\#広告」または英語「sponsored」「paid link」表記を制作チェックリストの必須項目とする |


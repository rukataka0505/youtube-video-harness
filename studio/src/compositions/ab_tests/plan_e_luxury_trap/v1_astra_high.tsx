import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile} from 'remotion';
import {PlanEMacroEconTemplateV2, PlanESceneSpec, PlanEProjectSpec} from '../../../components/plan_e/legacy';
import {FONT_ECON_SERIF, FONT_ECON_SANS} from '../../../components/plan_e/fonts';
import {BASE_TIMELINE as base} from './baseTimelineData';

const ink = '#242723';
const red = '#992e25';
const green = '#245c4b';
const progress = (time: number, from: number, duration = 0.7) =>
  interpolate(time, [from, from + duration], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

// 二つの母数を同じ長さで描き、少人数が支払う金額の大きさを面積で比較する。
function MarketBoard({time, reprise}: {time: number; reprise: boolean}) {
  const rows = [{label: '購入者数', share: 2}, {label: '売上高', share: 45}];
  return <svg viewBox="0 0 1600 820" style={{width:'100%', height:'83%', fontFamily:FONT_ECON_SANS}} fill={ink}>
    <rect x="7" y="7" width="1586" height="806" fill="#faf9ef" stroke="#8b6744" strokeWidth="14"/>
    <text x="94" y="125" fontSize="45" fontFamily={FONT_ECON_SERIF}>世界の高級品市場</text>
    <text x="1508" y="135" fontSize="92" textAnchor="end" fontFamily={FONT_ECON_SERIF}>約60兆円</text>
    <path d="M94 177H1506" stroke={ink} strokeWidth="3"/>
    <text x="94" y="252" fill={green} fontSize="34">■ 上位顧客</text>
    <text x="367" y="252" fill={red} fontSize="34">■ その他の購入者</text>
    {rows.map(({label, share}, i) => {
      const y = 330 + i*202;
      const reveal = progress(time, reprise ? i * 0.35 : 1.8 + i * 3.8);
      const width = 1320*share/100;
      return <g key={label} opacity={reveal}>
        <text x="108" y={y} fontSize="37">{label}</text>
        <rect x="108" y={y+25} width={1320*reveal} height="48" fill="#d7a294"/>
        <rect x="108" y={y+25} width={width*reveal} height="48" fill={green}/>
        <text x="108" y={y+133} fontSize="54" fill={green}>{share}%</text>
        <text x="1428" y={y+133} textAnchor="end" fontSize="54" fill={red}>{100-share}%</text>
      </g>;
    })}
  </svg>;
}
const board = (startSec: number, endSec: number, reprise = false): PlanESceneSpec => ({
  id: reprise ? '市場再掲' : '市場内訳', startSec, endSec, type:'custom', backdropMode:'editorial_paper',
  render: ({sec}) => <MarketBoard time={sec-startSec} reprise={reprise}/>,
});

const scenes: PlanESceneSpec[] = [
  {id:'店頭', startSec:0, endSec:6.46, type:'video_broll', imageKey:'luxury_handbag_display', motion:'slow_zoom_in', grade:'warm_night',
    overlayCutout:{badge:'店頭価格', headline:'¥1,600,000', enterOffsetSec:1.8}},
  {id:'静止', startSec:6.46, endSec:9.3, type:'vhs_pause_avatar', frozenImageKey:'luxury_handbag_display', timecodeLabel:'00:00:06', avatarEmblem:'？'},
  {id:'購買動機', startSec:9.3, endSec:20.33, type:'editorial_cutout', backdrop:'paper', mastheadTitle:'買い手の横顔', glitchIntroSec:0.24,
    cards:[{badge:'資産家',headline:'控えめな意匠', stampText:'ロゴ小', stampOffsetSec:1.2},
      {badge:'背伸び層',headline:'ひと目でわかる柄', enterOffsetSec:4.2,stampText:'ロゴ大',stampOffsetSec:5.15}]},
  board(20.33,36.61),
  {id:'買い物客', startSec:36.61, endSec:40.84, type:'custom', backdropMode:'crisis_dark',
    render:({fps,videoMap}) => <AbsoluteFill style={{overflow:'hidden'}}>
      <Sequence from={Math.ceil(36.61*fps)}>
        <OffthreadVideo muted src={staticFile(videoMap.luxury_boutique_broll)}
          style={{width:'100%',height:'100%',objectFit:'cover',filter:'blur(15px) brightness(0.74)',transform:'scale(1.045)'}}/>
      </Sequence>
    </AbsoluteFill>},
  {id:'利益の行方', startSec:40.84,endSec:57.04,type:'editorial_cutout',backdrop:'paper',mastheadTitle:'部門別決算',mastheadSubtitle:'2024年',
    cards:[{badge:'LVMH',headline:'ファッション・革製品',highlightLine:'営業利益率',stampText:'37.1%',stampOffsetSec:5.96},
      {badge:'売上100円あたり',headline:'約37円',highlightLine:'営業利益',enterOffsetSec:10.76}]},
  {id:'定価',startSec:57.04,endSec:64.87,type:'whiteboard_trend',title:'定番バッグの米国定価',subtitle:'ドル／点・各年の概算',xLabels:['2019年','2024年'],
    yMin:0,yMax:12000,yTicks:[0,4000,8000,12000],series:[{id:'price',label:'定番バッグ',badgeText:'約10,800ドル',color:red,values:[5800,10800],isHighlight:true}],
    highlightOffsetSec:0.4,circleLastHighlight:true,stampText:'国内160万円超',avatarEmblem:'¥'},
  {id:'離脱',startSec:64.87,endSec:82.18,type:'causal_gear_loop',surfaceTheme:'paper',title:'値上げと客離れ',centerLockLabel:'値下げせず',
    leftActor:{emblem:'¥',actorLabel:'ブランド',headline:'もう一段の値上げ',statusBadge:'価格上昇',tone:'amber'},
    rightActor:{emblem:'客',actorLabel:'購入者',headline:'約5,000万人減',statusBadge:'市場から退出',tone:'crimson'},
    topFlowLabel:'購入のハードル',bottomFlowLabel:'買い手の減少',rightPhaseOffsetSec:6.9,lockOffsetSec:13.24},
  {id:'調査',startSec:82.18,endSec:91.26,type:'editorial_cutout',backdrop:'corkboard',showRedString:true,
    cards:[{badge:'購買行動研究',headline:'2010年',highlightLine:'ブランドロゴの目立ち方'},
      {badge:'分類の二軸',headline:'資産 × 顕示欲',highlightLine:'買い手の4類型',enterOffsetSec:4.84}]},
  {id:'意匠',startSec:91.26,endSec:104.58,type:'editorial_cutout',backdrop:'broll',backgroundImageKey:'luxury_handbag_display',
    cards:[{badge:'同じ階層へ',headline:'素材・仕立て',stampText:'控えめ',stampOffsetSec:4.32},
      {badge:'広い相手へ',headline:'目立つロゴ',enterOffsetSec:9.12}]},
  {id:'顕示的消費',startSec:104.58,endSec:119.73,type:'editorial_cutout',backdrop:'paper',mastheadTitle:'有閑階級の理論',mastheadSubtitle:'1899年',
    cards:[{badge:'ヴェブレン',headline:'顕示的消費',highlightLine:'高価であることの価値'},
      {badge:'値上げ後',headline:'買える側',enterOffsetSec:5.97,stampText:'選別',stampOffsetSec:10.08}]},
  {id:'日本',startSec:119.73,endSec:127.05,type:'projector_target_map',targetLabel:'日本',targetCountryId:'jp',nextChapterLabel:'',avatarEmblem:'円'},
  {id:'開封',startSec:127.05,endSec:130.65,type:'custom',backdropMode:'editorial_paper',
    render:({sec,imageMap}) => {
      const reveal = progress(sec,127.05,2.8);
      return <div style={{height:'82%',display:'grid',placeItems:'center'}}>
        <div style={{width:510,height:725,border:'15px solid #252725',borderRadius:52,background:'#fff',overflow:'hidden',transform:'rotate(-4deg)',boxShadow:'15px 20px 0 #d7cdbf'}}>
          <div style={{height:74,padding:'14px 30px',fontSize:35,fontFamily:FONT_ECON_SANS}}>開封動画</div>
          <div style={{position:'relative',height:505,overflow:'hidden'}}>
            <Img src={staticFile(imageMap.luxury_handbag_display)} style={{width:'100%',height:'100%',objectFit:'cover',transform:'scale('+(1+reveal*0.15)+')'}}/>
            <div style={{position:'absolute',bottom:0,width:(100*reveal)+'%',height:8,background:red}}/>
          </div>
          <div style={{padding:'24px 30px',fontSize:34,color:ink,fontFamily:FONT_ECON_SERIF}}>自分へのご褒美</div>
        </div>
      </div>;
    }},
  {id:'購買理由',startSec:130.65,endSec:141.84,type:'editorial_cutout',backdrop:'corkboard',showRedString:true,
    cards:[{badge:'一生モノ',headline:'長く使える'},{badge:'資産価値',headline:'手元に残る',enterOffsetSec:0.8},
      {badge:'ご褒美',headline:'財布なら',enterOffsetSec:1.6,stampText:'値上げの噂',stampOffsetSec:3.92}]},
  board(141.84,152.76,true),
  {id:'問い',startSec:152.76,endSec:161.5,type:'video_broll',imageKey:'luxury_handbag_display',motion:'slow_zoom_in',
    overlayCutout:{badge:'次の買い手',headline:'¥1,600,000',stampText:'誰の財布？',stampOffsetSec:5.04}},
];
const spec: PlanEProjectSpec = {...base, id:'luxury-trap-astra',themeTitle:base.title,scenes,
  autoSceneSfx:false,showTickerBar:false};
export const ABLuxuryTrapV1AstraHigh: React.FC = () => <PlanEMacroEconTemplateV2 spec={spec}/>;



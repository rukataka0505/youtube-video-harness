import { Config } from '@remotion/cli/config';

// 通常の本編MP4はGPU描画で書き出す。透過動画には --image-format=png を指定する。
Config.setChromiumOpenGlRenderer('angle');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setConcurrency(8);
Config.setOverwriteOutput(true);

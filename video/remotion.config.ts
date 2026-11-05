// Remotion の書き出しの設定（ローカルで書き出すだけ。API は使わない）
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");

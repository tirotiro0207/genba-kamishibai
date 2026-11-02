// 作ったもの（録画・同意書・絵の試し・画面の写し・動画の素材・手描き）の置き場。リポジトリの private/ で、git にも GitHub にも入らない
import { join } from "node:path";

export const PRIVATE_DIR = join(import.meta.dirname, "..", "..", "private");

/** private/ の下のパス（rec・consent・picto・dashboard・material・inbox） */
export const privatePath = (...parts: string[]) => join(PRIVATE_DIR, ...parts);

/** 録画の置き場。環境変数 RECORD_DIR で変えられる */
export const RECORD_DIR = process.env.RECORD_DIR || privatePath("rec");

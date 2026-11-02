// 絵の面の文字（037）。カードの絵の面は文字 0 字にする。SVG の見た目の決まり（<style>）と注釈（<title>・<desc>）を除いて、
// 画面に出る文字が残っていないかを数える。画面のテストと録画の両方で使う。
export function faceText(svg: string): string {
  return svg
    .replace(/<(style|title|desc|metadata)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, "x")
    .replace(/\s+/g, "");
}

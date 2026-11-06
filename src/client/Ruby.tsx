// やさしい日本語を、ふりがなを漢字の上に付けて出す（「｜漢字《よみ》」の書き方。src/shared/ruby.ts）
import { rubySegments } from "../shared/ruby";

export function Ruby({ text }: { text: string }) {
  return (
    <>
      {rubySegments(text).map((x, i) =>
        x.ruby ? (
          <ruby key={i}>
            {x.text}
            <rp>（</rp>
            <rt>{x.ruby}</rt>
            <rp>）</rp>
          </ruby>
        ) : (
          x.text
        ),
      )}
    </>
  );
}

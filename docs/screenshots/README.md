# Beautiful Mermaid browser verification

2026-07-15に、配布用の`media/main.js`をローカルHTTPサーバーから実ブラウザへ読み込み、[CraftのBeautiful Mermaidサンプル](https://agents.craft.do/mermaid)と同じ記法を描画しました。

確認した図は次の3つです。

- CI/CD Pipeline（Flowchart）
- OAuth 2.0 Sequence（Sequence Diagram）
- Sprint Burndown（XY Chart）

ブラウザ上の結果は、Mermaid figureが3件、描画済みSVGが3件、描画エラーが0件でした。コンソールのwarningとerrorも0件でした。

SVGの`viewBox`は順に次の値でした。

- `0 0 513.575 896.738`
- `0 0 589.1145 520`
- `0 0 750 492`

証跡は次のファイルです。

- `beautiful-mermaid-craft-browser.jpg`
- `beautiful-mermaid-craft-sequence.jpg`
- `beautiful-mermaid-craft-xychart.jpg`

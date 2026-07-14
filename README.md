# Markdown Preview Annotator

Markdownのプレビューを読みながら、選んだ文章へコメントを付けるVS Code／Cursor拡張機能です。コメントをまとめて、AIエージェントへそのまま渡せるMarkdownとしてコピーできます。

## できること

- GitHub風のMarkdownプレビューをエディターの横に開きます。
- 文章を選択すると「コメント」バブルが現れ、その場でコメントを追加できます。
- 選択箇所を柔らかくハイライトし、右側にコメント一覧を表示します。コメントカードにポインターを載せると、対応する本文が強調されます。
- コメントは後から編集でき、引用をクリックすると該当箇所へスクロールします。
- コメントから元Markdownの行へ移動できます。
- 全コメントを、ファイル名・行番号・引用文つきでコピーできます。
- コードブロックは言語バッジつきでシンタックスハイライトされ、ワンクリックでコピーできます。配色はVS Codeのテーマ(ライト/ダーク)に連動し、OSの外観設定に影響されません。
- Mermaidのコードブロックは`beautiful-mermaid`で、余白と配色を整えたモダンなSVGとして描画されます。
- テーブルは横スクロール可能な枠に収まり、行の縞模様とホバー強調で読みやすくなります。
- ツールバーの「Aa」から文字サイズ・フォント・行間・本文幅をその場で変更できます。
- ファイルの編集後も、選択文と前後の文脈から注釈位置を探し直します。
- コメントはVS Code／Cursorのワークスペース領域に保存します。プロジェクト内へ注釈ファイルは作りません。

起動時の処理を減らすため、この拡張機能はコマンドを実行するまで有効になりません。ソースはTypeScriptで、Bunで単一ファイルへバンドルして配布します。UIフレームワークは使いません。

## 導入方法

### 1. VSIXを作る

[Bun](https://bun.sh/)を入れたうえで、このリポジトリのルートで次を実行します。

```bash
bun install
bun run package:vsix
```

型チェック・ビルド・テストを通したうえで、ルートに `markdown-preview-annotator-0.3.1.vsix` ができます。

### 2. VS Codeへ入れる

コマンドパレットを開き、`Extensions: Install from VSIX...` を実行します。作成した `.vsix` を選び、VS Codeを再読み込みしてください。

CLIから入れる場合は次のコマンドでも導入できます。

```bash
code --install-extension markdown-preview-annotator-0.3.1.vsix
```

VSIXから入れた拡張機能は、自動更新されません。更新版を作った場合は、同じ手順で入れ直してください。入れ直したあとはウィンドウの再読み込み(`Developer: Reload Window`)を行い、拡張機能ビューでバージョンが `0.3.1` になっていることを確認してください。`0.3.0`にはWebview用バンドルの起動不具合があるため、Mermaidを使う場合は`0.3.1`へ更新してください。VS Codeの公式手順は[Install from a VSIX](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_install-from-a-vsix)にあります。

### 3. Cursorへ入れる

CursorもVS Code拡張機能を使えます。Cursorのコマンドパレットを開き、`Extensions: Install from VSIX...` を実行します。作成した `.vsix` を選び、Cursorを再読み込みしてください。

Cursorの公式ドキュメントにも、言語対応をVS Codeと同じように拡張機能で追加できると記載されています。[Cursor installation](https://docs.cursor.com/get-started/installation#language-support)

## 使い方

手順は4つです。

1. コメントしたい `.md` ファイルを開きます。
2. コマンドパレットで `Markdown Preview Annotator: 注釈プレビューを横に開く` を実行します。エディター右上のメニューからも実行できます。
3. プレビュー内の文章をドラッグして選び、表示された入力欄へコメントを書きます。
4. 右上の「コメントをコピー」を押し、Cursor Chat、ChatGPT、Claudeなどへ貼り付けます。

コピーされる内容は次の形式です。

```markdown
# Markdown review comments

File: `docs/spec.md`

Apply the following comments to the Markdown document.

## Comment 1

Location: lines 8-10

Selected text:
> The API retries failed requests indefinitely.

Comment:
再試行回数の上限と、失敗時の処理を明記してください。
```

## 設定

表示に関する設定は、プレビュー右上の「Aa」ボタンからその場で変更できます。変更内容はVS Codeのユーザー設定に保存され、次回以降のプレビューにも反映されます。設定エディターからも同じ項目を変更でき、開いているプレビューへ即時反映されます。

| 設定 | 既定値 | 内容 |
| --- | --- | --- |
| `markdownPreviewAnnotator.fontSize` | `14` | 本文の文字サイズ(px)。10〜28の範囲。 |
| `markdownPreviewAnnotator.fontFamily` | `theme` | 本文フォント。`theme`(テーマ標準)/`sans`(ゴシック)/`serif`(明朝)/`mono`(等幅)。 |
| `markdownPreviewAnnotator.lineHeight` | `normal` | 行間。`compact`/`normal`/`relaxed`。 |
| `markdownPreviewAnnotator.contentWidth` | `full` | 本文幅。`full`は横幅いっぱい、`readable`は最大980px。 |

## Mermaid描画

`mermaid`コードブロックは、[`beautiful-mermaid`](https://github.com/lukilabs/beautiful-mermaid)を使ってSVGへ変換します。背景・文字・線・アクセントの色にはVS Codeのテーマ変数を渡すため、ライト／ダークテーマへ自動で追従します。レンダラーは`media/main.js`へまとめてバンドルされ、外部CDNや別プロセスは使いません。

現在対応している図は、Flowchart、State、Sequence、Class、ER、XY Chartです。Mindmap、Gantt、Git Graph、C4、Pie、Timeline、Architecture Diagramなどの未対応記法は、元コードを残したまま「図を描画できませんでした」と表示します。

## 注釈の保存と復元

コメントはファイルごとに `workspaceState` へ保存します。同じワークスペースでプレビューを開き直すと復元されます。Gitには追加されず、ほかの端末やメンバーとは同期されません。

Markdownの編集後は、まず元の文字位置を確認します。位置が変わっていた場合は、選択文と前後40文字を使って候補を探します。選択文そのものが削除された場合は、コメント一覧へ「位置不明」として残ります。

## 現在の制限

- 共同レビューやコメントのGit共有には対応していません。
- 選択文が同じ内容で何度も現れ、前後の文脈も同じ場合は、元位置に近い候補を選びます。
- 安全のため、Markdown内の生HTMLは表示せず文字として扱います。
- 外部リンクは `http`、`https`、`mailto` だけ開きます。

## 開発

ソースはTypeScript(`src/`)で、Bunでビルドします。

```bash
bun install
bun run typecheck   # tscによる型チェック
bun run build       # dist/extension.js と media/main.js を生成
bun test            # bun:test + jsdom
```

VS Code／Cursorでこのフォルダーを開き、`F5` を押すとビルドしてからExtension Development Hostが起動します。

配布物に `node_modules` は含まれません。

- [`markdown-it`](https://github.com/markdown-it/markdown-it) と [`highlight.js`](https://github.com/highlightjs/highlight.js) は `dist/extension.js` にバンドルされます。
- Webviewスクリプトと[`beautiful-mermaid`](https://github.com/lukilabs/beautiful-mermaid)は `media/main.js` にまとめてバンドルされます。
- 本文・コード・テーブルの配色はすべてVS Codeテーマ変数と、テーマ種別(`vscode-dark`/`vscode-light`)に連動した自前パレットで決まります。GitHub由来のCSSには依存しません。

## ライセンス

[MIT](./LICENSE)

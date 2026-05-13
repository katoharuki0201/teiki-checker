# AGENTS.md

## リポジトリの構成
- シングルパッケージの Vite アプリ。ロックファイルは `package-lock.json` なので `npm` を使うこと。
- React のエントリポイントは `src/main.tsx` で、`StrictMode` 下で `src/App.tsx` をレンダリングする。
- グローバルスタイルは `src/index.css`、アプリ固有のスタイルは `src/App.css` に置く。
- `README.md` は Vite のテンプレートそのまま。真実の情報源はスクリプトと設定ファイルを優先すること。

## コマンド
- 依存関係のインストール: `npm install`
- 開発サーバーの起動: `npm run dev`
- 本番ビルドの確認: `npm run build` は `vite build` の前に `tsc -b` を実行する
- Lint: `npm run lint` は `eslint .` を実行する
- ビルド済みアプリのプレビュー: `npm run preview`
- 現時点ではテストスクリプトは未設定

## ツールチェーンの注意点
- TypeScript はルートの `tsconfig.json` から `tsconfig.app.json` と `tsconfig.node.json` へのプロジェクト参照を使っている。
- `tsconfig.*.json` は `noUnusedLocals`、`noUnusedParameters`、`erasableSyntaxOnly` を有効にしている。enum や namespace、パラメータプロパティなど、ランタイム出力が必要な TypeScript 構文は避けること。
- ESLint の対象は `**/*.{ts,tsx}` のみで、`dist` は無視される。
- React Compiler は Vite テンプレートでは有効になっていない。

## 追う必要のないファイル
- このファイル作成時点では、CI ワークフロー、pre-commit 設定、コード生成、フォーマッター設定は存在しない。

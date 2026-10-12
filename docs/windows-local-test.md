# Windowsでテスト用ブランチを取得する

このブランチはローカルテスト用。mainへのmergeやGitHub Pagesへの公開は行わない。接続設定は空欄・無効、購入権限DB/Stripeは未実装。既存4作品の公開設定を変更しない。

## 1. 用意するもの

- Git for Windows
- Python 3（Windowsの`py`ランチャーが利用可能な構成）
- Node.js 24 LTS以上：自動/ブラウザテストを実施する場合。アプリを開くだけなら不要。
- PowerShellと通常のブラウザ

インストール後にPowerShellを開き直し、`git --version`、`py --version`、`node --version`、`npm.cmd --version`を確認する。npm.ps1が実行ポリシーで止まる場合はnpm.cmd/npx.cmdを使い、OSの実行ポリシーを広く変更しない。

## 2. 新しいフォルダにcloneする（推奨）

既存作業フォルダを上書きせず、別フォルダを使う。

```powershell
cd $HOME\Documents
git clone --branch test/supabase-local-auth --single-branch https://github.com/kacchan-lab/hazure-no-kioku.git hazure-no-kioku-local-test
cd hazure-no-kioku-local-test
git branch --show-current
git status --short
```

branchがtest/supabase-local-auth、statusが空であることを確認する。mainではない。後で更新を取得するときは、このブランチで `git pull --ff-only origin test/supabase-local-auth` を使う。設定値を変更している場合は、先に値を安全に退避して空欄に戻す。変更を強制破棄するコマンドは使わない。

既にclone済みのフォルダを使う場合は、まずgit statusで作業を確認・保全してから、`git fetch origin test/supabase-local-auth` と `git switch --track origin/test/supabase-local-auth` を使う。branchが既にある場合は `git switch test/supabase-local-auth`。未保存作業があるときは無理に切り替えない。

## 3. アプリを起動する

```powershell
py scripts/serve_local.py --port 8000
```

PowerShellを開いたまま、ブラウザで `http://127.0.0.1:8000/` を開く。終了はこのPowerShellでCtrl+C。URLを含むアクセスログを残さないサーバーである。

8000番が既に使われている場合は、自分の旧サーバーを閉じるか別ポートを使い、SupabaseのRedirect URLも合わせる。ブラウザのファイル直接オープン（file://）は使わない。

設定なしでFREE、5秒演出、一括バックアップを試せる。PLUS紹介のローカルデモで分析・回避額・行動プランも確認できる。デモのPLUSは購入権限ではない。

## 4. 自動テスト68件とブラウザテスト9本

接続設定を空欄・auth.enabled=falseにした状態で行う。実プロジェクトの値を入れたまま回帰テストをしない。

別のPowerShellを同じフォルダで開き、次を実行する。

```powershell
npm.cmd ci --ignore-scripts
npx.cmd playwright install chromium
npm.cmd test
npm.cmd run test:browser
```

ブラウザテスト中は手順3の8000番サーバーを動かす。Playwrightのバージョンはlockfileで固定する。WindowsではダウンロードしたPlaywright Chromiumを使用し、Codex/Linuxでは既存の/usr/bin/chromiumを自動選択する。テスト用ライブラリはアプリの実行時依存ではない。

ブラウザテストは隔離されたプロファイルと仮のデータを使う。Supabase応答もモックし、実際のメール・購入・決済を行わない。画面画像はOSの一時領域（Windowsでは `%TEMP%\hazure-no-kioku-test-results`）へ保存し、リポジトリに含めない。

Windows実機での実行は利用者側で確認する。Codex/Linuxで68件と9本を実行して検証する。

## 5. 自分のSupabaseでマジックリンクを試す

`docs/supabase-magic-link-test.md`に沿って、自分のPCだけでjs/public-config.mjsへProject URLとsb_publishable_公開キーを入れ、enabled:true、method:'magic-link'にする。Redirect URLは開いているアプリのURLとSupabaseの許可設定を一致させる。localhostと127.0.0.1を混在させない。

再読み込みしてログインリンクを送信し、同じブラウザで最新メールのリンクを開く。再読み込み、ログアウト、FREE利用を確認する。ログインしてもPLUSは解放しない。記録は端末内のまま自動同期しない。

Supabase標準メールには宛先/送信制限がある。実接続・メール到達はこの利用者テストで初めて確認する。秘密鍵やservice_role、DBパスワードは使わない。

## 6. 設定をGitへ入れない

テスト後、Project URL・キーを空欄、auth.enabled:falseへ戻す。

```powershell
node scripts/check-public-config.mjs --working-tree
git status --short
```

commit/pushは別途承認後だけ行う。承認後にステージした場合は `node scripts/check-public-config.mjs` でステージ済みの設定も確認する。コード・キー・メールリンク・認証トークンをチャットへ貼らない。公開キー自体はブラウザ配信可能だが、今回の作業用接続値はリポジトリへ入れない。

.gitignoreでnode_modules・テスト出力・ZIP・envファイルを除外している。public-config.mjsはアプリに必要なファイルなのでignoreしない。Gitのskip-worktree/assume-unchangedで変更を隠さない。

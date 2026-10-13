> 現在の初期方式はマジックリンクです。Supabase標準メールでの実接続は `supabase-magic-link-test.md` を参照してください。以下のOTPテンプレート変更は将来のSMTP導入後の手順です。

# メールOTP認証画面：ローカル実装とSupabase設定手順

## 現在の状態

HTML/CSS/JavaScriptの構成を維持し、設定画面とPLUS紹介から開く「アカウント・ログイン」を追加した。月額300円（税込・自動更新あり・いつでも解約可能）の表示と既存機能は維持する。

初期設定は未接続。Project URLとpublishable keyは空欄、auth.enabled=false。メール送信や外部サービスへの接続を行っていない。テストのSupabase応答はすべてモックで、実プロジェクトへのログインやメール到達は未検証。

- public-config.mjs：公開設定。秘密を入れない。
- auth.mjs：設定/入力検証、Supabase Auth REST adapter、認証状態controller。
- auth-ui.mjs：画面と開発用表示テスト。
- bootstrap.mjs：既存復元回復の後に認証画面を起動する。

REST adapterは公式Auth APIの /otp、/verify、/user、/token、/logout を呼ぶ準備コード。追加のランタイムライブラリは不要。実際のAPI互換性は接続承認後にテスト環境で確認する。

## 設定とデモの境界

```js
export const PUBLIC_CONFIG = Object.freeze({
  mode: 'development',
  developmentDemo: true,
  auth: Object.freeze({
    enabled: false,
    projectUrl: '',
    publishableKey: ''
  })
});
```

URLと公開キーだけをこのファイルに置く。service_role、sb_secret_キー、SMTPパスワード、Stripe秘密鍵は絶対に置かない。現在のadapterはsb_publishable_形式の公開キーだけを受け付け、旧JWT形式のanonキーは未対応（service_roleとの取り違えを避けるため）。HTTPSのSupabase標準プロジェクトURLを検証する。独自ドメインやセルフホストは現段階で未対応。

設定とメール準備が確認できた後、承認を受けて値を登録しenabled=trueにする。入力しただけでは契約権限が付与されない。設定なし/設定誤り/通信失敗でもFREEは動く。設定誤りをモック認証に自動変換しない。

開発用表示テストとPLUSデモはlocalhost/127.0.0.1/ループバックIPv6に限定する。GitHub Pagesなどのホスト環境、mode=production、認証接続有効時にはデモからのPLUS解放を無効にする。本番ではmode=production、developmentDemo=falseを設定する。クライアントコードを複製する利用者からローカル機能を完全に隠せるわけではない。今後のPLUSサーバー処理は必ずサーバーで権限を確認する。

## 認証とデータ

未ログイン・認証中・ログイン済み・認証失敗を表示する。ログインはPLUS契約中を意味しない。画面には「PLUS契約権限：未確認（契約権限管理は未実装）」と表示する。契約権限照会API・DB書き込み・決済は実装していない。

「初めて利用する」を選ぶと /otp のcreate_user=true、通常ログインはfalse。メールの6桁コードを /verify で確認後、アクセストークンで /user を呼び本人情報を確認する。ユーザーのメール、コードと認証用トークンだけをAuth APIへ送り、衝動・成功記録、言葉、回避額、メモ、行動プランは送らない。

認証トークンは専用sessionStorageキー hazure-no-kioku-auth-session-v1 にのみ保存する。タブを閉じると原則消える。他のタブでは再ログインが必要であり、端末間の自動同期はない。一括バックアップはlocalStorageの固定3キーだけなので認証情報を含まない。

再読み込み時に保存トークンをサーバーで確認し、期限が近い/切れた場合はrefresh tokenで更新する。開いたまま期限に達した場合は認証失敗として再読み込み/再ログインを案内する。定期的な自動更新やタブ間セッション共有は今後の別作業とする。サーバーのエラーメッセージやトークンを画面・console・URLへ出さない。

ログアウトは端末の認証状態を先に解除し、scope=localでサーバーに通知する。通知に失敗しても端末内状態は解除し、失敗を説明する。記録は削除しない。通信中にログアウトして古い応答が届いてもログイン状態を復活させない。OTP入力は検証を開始したら画面から消す。

## Supabaseダッシュボードで行う操作（接続承認後）

メニュー名はダッシュボード更新で異なる場合がある。以下の項目を探して設定する。今の段階でこちらからプロジェクト作成・設定変更は行っていない。

1. **テスト用プロジェクトを用意する。** SupabaseでNew projectを選び、Organization、名前、DBパスワード、リージョンを設定する。DBパスワードは安全に管理し、チャットやフロントには渡さない。既存プロジェクトを使う場合は対象と用途を確認する。本番とは分離する。
2. **Project URLを確認する。** プロジェクトのConnect画面またはProject SettingsのData API/API設定から、HTTPSの標準URL（https://実際のproject-ref.supabase.co）を取得する。架空のproject-refは設定しない。
3. **publishable keyを確認する。** Project Settings → API Keys等で、sb_publishable_から始まる公開キーを取得する。Secret key、service_role、DB接続文字列ではないことを確認する。
4. **Email認証を有効にする。** Authentication → Sign In / Providers → Email等で、メール認証を有効化する。新規登録を許可するかも確認する。今回は登録UIがあるため、登録を認めるテスト設定が必要。
5. **メールをコード形式にする。** Authentication → Email Templates等で、Magic LinkとConfirm Signupの両方に `{{ .Token }}` を表示する。リンクを押す方式ではなく、メールに届いたコードをアプリへ入力する方式。文面はサービス名・コード・有効期限の案内を含める。コードやリンクをログへコピーしない。
6. **OTP設定を確認する。** 現画面は6桁。OTPの桁数が6に設定できるか確認し、有効期限・送信間隔・Rate Limitsの値も確認する。項目が見当たらない/6桁以外の場合は、UIを推測で変更せず実接続前に知らせる。期限や上限を一律の数値と仮定しない。
7. **URL設定を行う。** Authentication → URL Configuration等でSite URLを実際のGitHub PagesのURLにする。例として https://kacchan-lab.github.io/hazure-no-kioku/ があるが、実際に使用中のURLであることを確認する。開発時の http://127.0.0.1:8000/ と必要な公開URLを許可する。OTP手入力では専用callbackページを使わない。必要以上に広いワイルドカードを登録しない。
8. **メール送信を準備する。** AuthenticationのSMTP設定等で本番向けCustom SMTP、送信者メール、送信者名を登録する。SMTPのhost/port/username/passwordはSupabaseダッシュボードにだけ設定する。配信サービス側で送信ドメイン認証（SPF/DKIM等）も行う。標準送信には宛先や回数制限があるため、一般利用者に送れるとは仮定しない。
9. **テストする。** 接続承認後に公開設定を登録してenabled=trueにし、登録→メール受信→OTP検証→再読み込み→ログアウトを確認する。期限切れ・誤コード・送信制限・通信失敗も確認する。Authentication → Usersにユーザーが登録され、衝動記録等はDBに送られていないことを確認する。

この段階ではPLUSのテーブル/RLS作成、権限付与API、Stripe商品/Checkout/Webhook設定は不要。後の承認段階で行う。

## 接続前に必要な情報

- テスト用Supabase Project URL。
- 対応するpublishable key（公開キーのみ）。
- 実際のGitHub Pages公開URL。
- Email認証/新規登録許可/OTP桁数・期限・再送制限の設定状況。
- メールテンプレートがコード形式か、送信者とCustom SMTPの準備状況。

メールサービスの秘密、DBパスワード、service_role、Stripe秘密情報は不要。秘密値をチャットで送らない。接続確認は値と設定が揃い、承認を受けた後に行う。プロジェクトの有無も未確認のため推測しない。

## 確認方法

設定・データ → アカウント・ログイン。ローカル開発では表示テストで4状態を確認できる。設定なしではメール送信不可で、外部通信は発生しない。表示テストの「ログイン済み」は実際の認証ではなく、別のPLUSデモ状態も変更しない。

自動テストは `node --test tests/*.test.mjs`。ブラウザはHTTPサーバーを起動して `node tests/auth-browser.cjs`。実通信テストではなく、ルートをモックしてAPI呼び出し・状態・失敗・再読み込み・本番デモ無効化を検証する。既存7本のブラウザテストも維持する。

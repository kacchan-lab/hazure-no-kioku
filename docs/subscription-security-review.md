# 月額PLUS：実DB適用前セキュリティレビュー

対象：supabase-auth-entitlements-design.md / subscription-entitlements.sql。レビュー日：2026-10-13。実Supabase・Stripeには接続せず、ローカルの隔離PostgreSQL 17で検証する。作業前の未commitファイルは `/workspace/backups/hazure-no-kioku-pre-security-review-20261013/source-and-tests.tar` に保全した。

## 指摘と修正

| 重要度 | 指摘 | 対応・残りの条件 |
|---|---|---|
| 重大（本番導入の阻害要因） | 権限判定とWebhookの並行制御が設計の文章だけで、稼働するサーバーがない | DB時刻・鮮度を検査する本人用read-only関数を追加。署名検証・照合RPC/worker・停止の伝播・transaction処理は未実装のため本番適用不可 |
| 重大（設定不備があった場合） | クライアントが管理ロールを継承している場合、単純なREVOKEでは継承経由の権限を除去できない | anon/authenticatedのSUPERUSER/BYPASSRLS・service_role/適用owner継承を適用前に拒否。public schema CREATEも拒否 |
| 中程度 | 有限日時の制約がなく、無期限の権限行を作れた | isfinite制約と半端なNULL期間拒否を追加。開始/終了の境界はread-only関数で検証 |
| 中程度 | 返金額の減少や返金済みinvoiceのpaidへの再更新を通常workerが行えた | 単調な成功返金額・全額返金/voidの終端状態・invoice識別/期間/支払額不変をtriggerで保証。workerのinvoice DELETE/TRUNCATEも禁止 |
| 中程度 | 既存billing_privateをIF NOT EXISTSで取り込むため、未知のowner/既存オブジェクトを信用し得た | 既存schema/table/function検出で適用前に停止。再適用は明示エラーとtransaction rollbackで既存状態を維持 |
| 中程度 | 実行拒否テストとデータを失わないロールバックが未整備 | 二人の本人参照・権限変更拒否・期限/返金検証、途中失敗、再適用、空schema限定rollbackを追加 |
| 軽微 | 将来のprivate関数にデフォルトPUBLIC EXECUTEが付く可能性 | 適用ownerのprivate schema default privilegesを制限し、今回の関数も明示REVOKE。別ownerで追加する場合は再監査 |
| 軽微 | active＋refundedなど矛盾する投影行を保存できた | activeはpaid/failedだけに制約。failedは既払い期間内のみ許可。生のstatusを権限根拠にしない |

これらは「anonが元のSQLで直ちに自由な権限変更をできた」という指摘ではない。元の本人SELECTポリシーとクライアント書き込みREVOKEは整合していた。問題は将来の管理側の誤更新、環境の権限継承、未実装処理への依存にある。

## RLS・関数のレビュー結果

- public.plus_entitlements：RLS有効、authenticated本人SELECTのみ。anon読み取り、両clientのINSERT/UPDATE/DELETE/TRUNCATEは拒否。余分な更新ポリシーはない。
- billing_private：schema USAGE/CREATEとtable権限を両client/PUBLICから剥奪し、全table RLS有効、client向けpolicyなし。SupabaseのData API公開schemaへ追加しない。
- service_role：サーバー専用でBYPASSRLSを持つ前提。RLSはこのキーの漏えいを防げない。APIの本人検証と秘密保管は必須。通常workerのinvoice台帳DELETEは禁止。所有者/管理者の意図的な変更は防ぐ対象ではない。
- SECURITY DEFINERはない。追加関数はSECURITY INVOKER、search_path空欄、参照schemaを明示。get_plus_access()はauthenticatedにだけEXECUTEを付与し、trigger関数はservice_roleのみ。
- ログインできるDBユーザー/ロールにクライアント権限を渡さない。JWTのsubjectはPostgREST/Authが検証して設定し、クライアントの申告を信用しない。

## 契約判定・Webhook

契約開始は成功invoice照合後。予約解約は既払い期間を維持、次回請求なし。決済失敗で既払い期間を消さず、期限後は拒否。無限期限、将来開始、有効期限ちょうど、古い/未来の照合時刻、停止をテストする。raw RLS SELECTは契約概要を読むだけであり、有効な利用権を保証しない。

get_plus_access()は5分以内の投影とDB時刻を確認するだけで、Stripeへは接続しない。直近返金/解約の到達遅延やworker失敗の検出はAPI/定期照合で扱う。通信・再照合失敗をnoneへ変換しない。snapshotの期限を超えてオフライン許可を延長しない。

event.id一意制約は重複保存だけを防ぐ。pending/failedを再試行し、processedだけを完了扱いとする。古いeventからのinvoice巻き戻しはtriggerで拒否できるが、古いworkerによるplus_entitlements書き換えまではtriggerで防げない。Stripe再取得、ユーザー単位lease＋世代CAS、invoice/停止/権限/処理済み記録の原子的更新、再照合は次段階に実装が必要。全額返金後の古いpaid通知で権限を復活させないサーバーテスト、同時worker試験は未実施。

## ローカルでの再現確認

Dockerを用意し、リポジトリで実行する。

```sh
node scripts/test-subscription-sql.cjs
npm test
```

runnerはchecksum付きの公式PostgreSQL 17 imageを使い、新規containerをnetwork=none・公開portなしで起動する。trust認証はこの隔離された模擬環境限定。Supabase用のロールとauth.uid()を模擬し、デフォルトの広いGRANTからもmigrationが権限を剥奪できることを試す。終了時は自分のcontainerを停止して除去する。Supabase実DBを接続先に指定するオプションはない。

検証内容：匿名拒否、本人A/B分離、他人参照/本人変更/DDL/EXECUTE拒否、service書き込み、予約解約、既払い中の支払失敗、期限境界、将来開始、停止、鮮度切れ、無限日時、部分/全額返金の巻き戻し拒否、event重複と再試行、fixtureのrollback。さらに同一migration再適用拒否、既存schema保存、CREATE/管理継承不備で停止、途中DDL失敗の原子rollback、非空/依存付きrollback拒否、空schema取り消し→再適用を確認する。

## Supabase実テストDBでの検証手順（今回は未実施）

1. 本番と分離した使い捨てテストprojectを用意し、Auth/公開schema/default privileges/role membershipを管理者が確認する。既存同名オブジェクトがある場合は初期SQLを適用しない。適用前のschema/ACLとバックアップを取得する。service_roleやDB passwordをチャット・Git・フロントへ置かない。
2. 管理者がON_ERROR_STOP付きpsql等で初期SQL全体をtransactionとして実行する。エラー時はROLLBACK/接続終了し、COMMITを押して先へ進めない。SQL Editorでも全文を1単位で実行する。
3. `tests/sql/subscription-security.sql` を管理者として全文実行する。このスクリプトは空の課金schemaとfixture用Auth ID未使用を要求し、最後はROLLBACKする。実SupabaseのAuth追加triggerがある場合は副作用を確認してから使う。模擬用 `local-supabase-fixture.sql` は実Supabaseへ絶対に実行しない。
4. 実Authでテスト利用者A/Bを作成し、管理者がこの二人にテスト用の契約概要行を作る。二人のJWTでPostgRESTから `plus_entitlements?select=*` を取得し、本人行だけになることを確認する。anonは権限エラーまたはポリシーに従う拒否で、行を取得できないことを確認する。
5. authenticated JWTによるPOST/PATCH/DELETEは他人だけでなく本人の行でも拒否されることを確認する。GET成功だけでRLS合格とはしない。`rpc/get_plus_access` は本人の結果のみ、anonはEXECUTE拒否。private schemaはData APIへ追加せず到達不能であることも確認する。
6. 期限終了・予約解約・支払失敗・古いverified_atを管理者のテストfixtureで再現し、期限後allowed=false、鮮度切れverification_status=errorを確認する。期限終了後もFREE/端末内データ/一括バックアップは維持する。
7. 返金triggerと表制約の拒否、二重event、同一SQL再適用の停止を確認する。エラーを再適用の成功と呼ばず、既存行・policy・GRANTが変更されなかったことを確認する。

ロール切替SQL試験はDBのACL/RLSを試す。実JWTの検証・HTTP応答・Supabaseのevent triggerや実Auth環境はステップ4以降で別途確認が必要。試験後の手動テスト行/アカウントは使い捨てproject内でのみ管理する。

## ロールバック

- 初期適用中のエラー：transactionをROLLBACKする。DDLとACL変更を途中の状態で残さない。
- 適用後、まだデータがないテストschema：`sql/subscription-entitlements-rollback.sql`を全文transactionで実行する。全対象tableのACCESS EXCLUSIVE lockを取得して空確認と削除の間の同時書き込みを防ぐ。データが1行でもある、未知の依存がある場合は拒否して元のschemaを維持する。CASCADE、TRUNCATEによる強制削除をしない。
- データ付き環境：worker/APIの書き込みを停止し、権限照会を確認失敗としてFREEへ安全に退避。バックアップを確認し、データ保全付き前進migrationまたはレビュー済み復元を行う。課金/返金データやAuthを無断で削除しない。DB復元はStripeの外部契約を巻き戻せないため、復元後のStripe再照合が必須。
- migrationを別ownerで適用した場合や外部オブジェクトを変更した場合は、そのowner/default ACLも個別に検証する。今回のrollbackは自分の初期schemaだけが対象。

## 判定

**使い捨てSupabaseテストDBへの検証目的の適用は条件付き可。販売用の本番DBへの適用はまだ不可。** 条件は既存同名schemaなし、管理権限の事前確認、バックアップ取得、transactionでの実行、実Supabaseでの本人参照/書き込み拒否試験である。次段階のWebhook/worker/RPC実装・Stripeテスト・実JWT/RLS検証が済むまで「本番契約権限基盤が安全に動作する」とは判断しない。

## 今回の検証結果

Node自動テスト76件すべて成功。ローカルPostgreSQL統合テストは、権限・契約境界、再適用拒否、rollback拒否/成功、途中適用失敗、適用前の危険設定拒否、rollback後の再適用の6群すべて成功。実SupabaseのHTTP/JWT/RLSとStripe処理は未検証である。アプリのJavaScript、端末内保存、5秒演出は今回のレビューでは変更していない。実DB適用、commit/push/mergeは実施していない。

// Development demo. No payments, authentication or real entitlement.
import {createDemoAccess,createUnverifiedAccess} from './plus-access.mjs';
import {PUBLIC_CONFIG} from './public-config.mjs';
import {developmentDemoAllowed} from './auth.mjs';
import {mountAnalysis} from './analysis-ui.mjs';
import {mountMoney} from './money-ui.mjs';
import {mountPlan} from './plan-ui.mjs';
const $ = id => document.getElementById(id);
const demoAllowed=developmentDemoAllowed(PUBLIC_CONFIG,location.hostname)&&!PUBLIC_CONFIG.auth.enabled;
const access = demoAllowed?createDemoAccess():createUnverifiedAccess();
document.querySelector('.plus-demo-controls').classList.toggle('hidden',!demoAllowed);
const analysis = mountAnalysis({container:$('plus-analysis'),access});
const money=mountMoney({container:$('plus-money'),access});
const plan=mountPlan({container:$('plus-plan'),access});
const states = {
 free: ['FREE（デモ）', '無料版の表示例です。現在の無料機能はすべて利用できます。'],
 plus: ['PLUS（デモ・未契約）', '有効な契約中の場合の表示例です。実際の契約はありません。分析・回避額・資産形成試算・行動プランを開発用デモとして確認できます。'],
 pending: ['契約確認中（デモ）', '契約確認を待つ場合の表示例です。通信や決済は行っていません。無料版は引き続き利用できます。'],
 error: ['確認失敗（デモ）', '契約状態を確認できない場合の表示例です。実際の通信エラーではありません。無料機能と保存済みの記録は維持されます。']
};
function renderDemo() {
 if(!demoAllowed){$('plus-demo-badge').textContent='契約権限：未確認';$('plus-demo-description').textContent='本番・ホスト環境では開発用デモを利用できません。ログインだけでPLUSは解放しません。';access.setDemoStatus('free');return;}
 const [badge, description] = states[$('plus-demo-state').value] ?? states.free;
 $('plus-demo-badge').textContent = badge;
 $('plus-demo-description').textContent = description;
 $('plus-demo-status').dataset.state = $('plus-demo-state').value;
 access.setDemoStatus($('plus-demo-state').value);
}
$('plus-demo-state').addEventListener('change', renderDemo);
function openPlus() {
 document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', p.id !== 'plus'));
 document.querySelectorAll('nav button').forEach(b => b.removeAttribute('aria-current'));
 analysis.refresh();
 money.refresh();
 plan.refresh();
 $('plus-heading').focus({preventScroll:true});
 window.scrollTo(0, 0);
}
$('open-plus').addEventListener('click',openPlus);
$('open-plus-analysis').addEventListener('click',()=>{openPlus();$('plus-demo-state').focus({preventScroll:true});$('plus-demo-state').scrollIntoView({block:'center'});});
for (const id of ['plus-back','plus-use-free']) {
 $(id).addEventListener('click', () => {
  document.querySelector('[data-page="home"]').click();
  $('open-plus').focus({preventScroll:true});
  window.scrollTo(0, 0);
 });
}
renderDemo();

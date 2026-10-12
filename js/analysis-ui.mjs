import {analyzeRecords} from './analysis.mjs';
import {loadState,KEY} from './model.mjs';
const svgNS='http://www.w3.org/2000/svg';
const node=(name,text,className)=>{const n=document.createElement(name);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const svgNode=(name,attrs,text)=>{const n=document.createElementNS(svgNS,name);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,value);if(text!==undefined)n.textContent=text;return n;};
export function mountAnalysis({container,access,storage=localStorage,now=()=>new Date()}) {
 let days=7,request=0;
 const controls=node('div',undefined,'analysis-period');controls.setAttribute('role','group');controls.setAttribute('aria-label','集計期間');
 const buttons=[7,30].map(value=>{const b=node('button',`直近${value}日`);b.type='button';b.dataset.days=value;b.onclick=()=>{days=value;render();};controls.append(b);return b;});
 const report=node('div');report.id='analysis-report';report.setAttribute('aria-live','polite');
 container.append(controls,report);
 async function render() {
  const id=++request;
  report.replaceChildren();container.classList.add('hidden');
  let permission;try{permission=await access.getAccess();}catch{return;}
  if(id!==request||!permission?.allowed)return;
  container.classList.remove('hidden');
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.days)===days)));
  let result;try{result=analyzeRecords(loadState(storage).records,days,now());}catch{
   report.append(node('p','保存データを読み込めないため、分析を表示できません。元のデータは変更していません。設定でバックアップを確認してください。','analysis-error'));return;
  }
  report.append(node('p',`${result.start} 〜 ${result.end}（今日を含む${days}日・端末の現地時刻）`,'quiet'));
  const stats=node('div',undefined,'analysis-stats');
  for(const [label,value,key] of [['衝動を感じた回数',`${result.urges}回`,'urges'],['打たずに済んだ自己申告',`${result.successes}回`,'successes'],['成功率',result.rate===null?'—':`${result.rate.toFixed(1)}%`,'rate']]){
   const card=node('div',undefined,'card');const amount=node('strong',value);amount.id=`analysis-${key}`;card.append(node('span',label),amount);stats.append(card);
  }
  report.append(stats,node('p','成功率 ＝ 期間内の「打たずに済んだ」自己申告の回数 ÷ 期間内の衝動の記録回数 × 100。日数の割合ではありません。自己申告がない記録は、実際に打ったことを意味しません。自己申告の回数は衝動を記録した日で集計します（申告日時は保存されていません）。','quiet'));
  if(!result.urges){report.append(node('p','この期間の記録はまだありません。成功率は算出できません。無料版で衝動を記録すると、ここで振り返れます。','analysis-empty'));return;}
  report.append(node('p',`${days}日中、記録があるのは${result.recordedDays}日です。記録のない日の状況は不明で、成功日として数えません。成功率は記録した${result.urges}件だけの集計で、長期的な傾向や禁パチ日数を示すものではありません。`,'quiet'));
  report.append(node('h3','日別の推移'));
  const legend=node('p','■ 衝動の記録　▥ 打たずに済んだ自己申告','analysis-legend');report.append(legend);
  const scroll=node('div',undefined,'analysis-chart');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','日別グラフ。30日は横にスクロールできます。日別の数値表もあります。');
  const width=Math.max(300,days*30+48),height=230,left=54,top=20,plotHeight=160,bottom=top+plotHeight,plotWidth=width-left-12,max=Math.max(1,...result.daily.map(r=>r.urges));
  const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-labelledby':'analysis-chart-title analysis-chart-desc'});svg.style.minWidth=`${width}px`;
  svg.append(svgNode('title',{id:'analysis-chart-title'},'日別の衝動と打たずに済んだ自己申告の回数'),svgNode('desc',{id:'analysis-chart-desc'},'縦軸は回数、横軸は日付。記録のない日は0件ですが、状況は不明です。正確な数値は下の日別表で確認できます。'));
  const defs=svgNode('defs',{}),pattern=svgNode('pattern',{id:'analysis-stripe',width:6,height:6,patternUnits:'userSpaceOnUse'});pattern.append(svgNode('rect',{width:6,height:6,fill:'#315c49'}),svgNode('path',{d:'M0 0L6 6',stroke:'#fff','stroke-width':1}));defs.append(pattern);svg.append(defs);
  const ticks=[...new Set([0,Math.ceil(max/2),max])];
  for(const tick of ticks){const y=bottom-tick/max*plotHeight;svg.append(svgNode('line',{x1:left,y1:y,x2:width-12,y2:y,stroke:'#dce3db'}),svgNode('text',{x:left-6,y:y+4,'text-anchor':'end',fill:'#66716a','font-size':12},String(tick)));}
  result.daily.forEach((r,i)=>{const slot=plotWidth/days,x=left+i*slot+slot/2,bar=Math.min(9,slot/3);
   for(const [value,offset,fill,label]of [[r.urges,-bar-1,'#66716a','衝動'],[r.successes,1,'url(#analysis-stripe)','自己申告']]){const rect=svgNode('rect',{x:x+offset,y:bottom-value/max*plotHeight,width:bar,height:value/max*plotHeight,fill});rect.append(svgNode('title',{},`${r.date} ${label} ${value}回`));svg.append(rect);}
   svg.append(svgNode('text',{x,y:bottom+23,'text-anchor':'middle',fill:'#303936','font-size':11},`${Number(r.date.slice(5,7))}/${Number(r.date.slice(8))}`));
  });
  scroll.append(svg);report.append(scroll,node('p','30日表示は横にスクロールできます。記録のない日は0件として描きますが、成功・失敗を判定しません。','quiet'));
  const details=node('details'),summary=node('summary','日別の数値を確認する'),table=node('table',undefined,'analysis-table');table.append(node('caption','日別の記録回数（自己申告）'));
  const head=node('thead'),tr=node('tr');for(const label of ['日付','衝動','自己申告','状況']){const th=node('th',label);th.scope='col';tr.append(th);}head.append(tr);table.append(head);
  const body=node('tbody');for(const r of result.daily){const tr=node('tr');tr.append(node('th',r.date),node('td',`${r.urges}回`),node('td',`${r.successes}回`),node('td',r.urges?'記録あり':'記録なし・不明'));tr.firstChild.scope='row';body.append(tr);}table.append(body);details.append(summary,table);report.append(details);
 }
 access.subscribe(render);
 window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null)render();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
 render();return {refresh:render};
}

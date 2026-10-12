// Pure, read-only aggregation. Dates are calendar days in the device timezone.
export function localDateKey(date) {
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function analyzeRecords(records, days, now = new Date()) {
 if (![7,30].includes(days) || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('集計期間が不正です。');
 const today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const start = new Date(today);start.setDate(start.getDate()-days+1);
 const daily=[];const byDate=new Map();
 for(let i=0;i<days;i++) {
  const date=new Date(start);date.setDate(start.getDate()+i);
  const row={date:localDateKey(date),urges:0,successes:0};daily.push(row);byDate.set(row.date,row);
 }
 for(const record of records) {
  const at=new Date(record.at);
  if(!Number.isFinite(at.getTime()) || at<start || at>now) continue;
  const row=byDate.get(localDateKey(at));if(!row)continue;
  row.urges++;if(record.success===true)row.successes++;
 }
 const urges=daily.reduce((n,r)=>n+r.urges,0),successes=daily.reduce((n,r)=>n+r.successes,0);
 return {days,start:localDateKey(start),end:localDateKey(today),daily,urges,successes,rate:urges===0?null:successes/urges*100,recordedDays:daily.filter(r=>r.urges>0).length};
}

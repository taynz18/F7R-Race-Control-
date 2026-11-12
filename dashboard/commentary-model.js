export const normalize=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
export const driverKey=name=>normalize(name);
export function family(name){const n=normalize(name);const tier=n.match(/tier\s*(\d+)/);if(tier)return 'tier-'+tier[1];if(/formula\s*2|realistic\s*f2/.test(n))return 'realistic-f2';if(/realistic/.test(n))return 'realistic-f1';if(/acc/.test(n))return 'acc';if(/lmu/.test(n))return /elms/.test(n)?'lmu-elms':/hyper/.test(n)?'lmu-hyper-gt3':'lmu-events';return n;}
export function trackKey(track){return normalize(track?.uniqueName||track?.trackName).replace(/\.\d{4}(?:\.\d+)?$/,'').replace(/[^a-z0-9]/g,'');}
export function classKey(value){const n=normalize(value).replace(/[^a-z0-9]/g,'');return /^(lm)?gt3$/.test(n)?'gt3':n;}
export function sessionKind(value){const n=normalize(value);return /qual/.test(n)?'qualifying':/race/.test(n)?'race':'other';}
export const finished=r=>r.position>0&&!/dnf|dsq|disqual|retir|dns|notstart/i.test(r.status||'');
export const known=name=>!!normalize(name)&&!/^unnamed|^player$|^unknown|^\?$/.test(normalize(name));
export function summarizeSeason(snapshot){
 const rows=[],tracks=new Map();
 for(const event of snapshot.events||[]){const t=event.event.track,key=trackKey(t);tracks.set(key,{key,name:t.trackName,layout:t.uniqueName,country:t.country,turns:t.turnsCount});
  for(const s of event.sessions||[]){if(s.sessionInfo.completedStatus!=='Completed')continue;const kind=sessionKind(s.sessionInfo.sessionType);if(kind==='other')continue;
   for(const d of s.drivers||[])rows.push({seasonId:snapshot.index.seasonId,seasonName:snapshot.index.seasonName,eventId:event.eventId,round:event.event.round,date:event.event.eventDateTime||event.event.eventDate||'',track:key,trackName:t.trackName,layout:t.uniqueName,session:s.sessionInfo.sessionId,kind,caption:s.sessionInfo.sessionCaption||s.sessionInfo.sessionType,driver:d.driverName||'Unnamed driver',driverKey:driverKey(d.driverName),position:d.classInfo?.classPosition>0?d.classInfo.classPosition:d.classificationPosition>0?d.classificationPosition:d.position>0?d.position:null,grid:d.gridPosition||null,status:d.status,fastest:d.fastestLapTimeMs>0?d.fastestLapTimeMs:null,points:d.driverPoints?.formatted??d.driverPoints??null,team:d.team,car:d.car,className:d.classInfo?.name||'',classKey:classKey(d.classInfo?.name),laps:d.lapsCompleted,stops:d.stints?Math.max(0,d.stints.length-1):null,penalty:d.penalties?.inGamePenaltySeconds==null?null:d.penalties.inGamePenaltySeconds+(d.penalties.stewardPenaltySeconds||0)});
  }
 }
 return {id:snapshot.index.seasonId,name:snapshot.index.seasonName,family:family(snapshot.index.seasonName),importedAt:snapshot.importedAt,tracks:[...tracks.values()],rows,standings:snapshot.standings?.seasonStatistics?.driverStandings||[],lineups:snapshot.lineups?.seats||[]};
}
const latest=(a,b)=>Date.parse(b.date||'1970-01-01')-Date.parse(a.date||'1970-01-01')||b.seasonId-a.seasonId||b.round-a.round;
export function buildBriefing(current,history,track,selectedClass=''){
 const scope=history.filter(s=>s.family===current.family),key=classKey(selectedClass);
 const rows=scope.flatMap(s=>s.rows).filter(r=>r.track===track&&(!key||r.classKey===key));
 const races=rows.filter(r=>r.kind==='race'),qualis=rows.filter(r=>r.kind==='qualifying');
 const raceIds=new Set(races.map(r=>r.seasonId+':'+r.session));
 const leaders=new Map();for(const r of races)if(r.position===1&&finished(r)&&known(r.driver))leaders.set(r.driver,(leaders.get(r.driver)||0)+1);
 const venueWinners=[...leaders].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 const recent=[...races].sort(latest),last=recent[0];
 const lastRace=last?races.filter(r=>r.seasonId===last.seasonId&&r.session===last.session).sort((a,b)=>(a.position||999)-(b.position||999)):[];
 const allCurrent=current.rows.filter(r=>r.kind==='race'&&(!key||r.classKey===key));
 const entrants=current.standings.filter(d=>!key||classKey(d.classInfo?.name)===key);
 const cards=entrants.map(d=>{
  const name=d.driverName||'Unnamed driver',id=driverKey(name),ck=classKey(d.classInfo?.name);
  const match=r=>known(name)&&r.driverKey===id&&(!ck||r.classKey===ck);
  const prior=races.filter(match),q=qualis.filter(match),results=prior.filter(finished);
  const form=allCurrent.filter(match).sort(latest).slice(0,3);
  const gains=results.filter(r=>r.grid>0).map(r=>r.grid-r.position);
  return {name,teamName:d.teamName||d.carName||'',teamInfo:d.teamInfo,car:d.car,className:d.classInfo?.name||'',position:d.position,points:d.points?.formatted??d.points??'—',gap:d.gapToLeader||'',seasonWins:d.positions?.wins??null,seasonPodiums:d.positions?.podiums??null,seasonPoles:d.positions?.polePositions??null,champion:!!d.isChampionshipSecured&&d.position===1&&(d.points?.raw||0)>0,starts:prior.length,wins:results.filter(r=>r.position===1).length,podiums:results.filter(r=>r.position<=3).length,poles:q.filter(r=>r.position===1).length,best:results.length?Math.min(...results.map(r=>r.position)):null,fastest:prior.some(r=>r.fastest)?Math.min(...prior.filter(r=>r.fastest).map(r=>r.fastest)):null,bestGain:gains.length?Math.max(...gains):null,form:form.map(r=>({position:r.position,status:r.status,track:r.trackName})),lastVisit:[...prior].sort(latest)[0]||null};
 });
 const talk=[];
 if(lastRace.length){const winner=lastRace.find(r=>r.position===1&&finished(r));if(winner)talk.push({title:'Last recorded visit',text:`${winner.driver} won the ${winner.seasonName.trim()} ${winner.caption} here${winner.date?' on '+winner.date.slice(0,10):''}.`,source:winner.seasonName});}
 if(venueWinners.length)talk.push({title:'Venue specialist',text:`${venueWinners[0][0]} has ${venueWinners[0][1]} recorded win${venueWinners[0][1]===1?'':'s'} here in this series.`,source:scope.length+' imported seasons'});
 // Venue records include former drivers, with ties retained and unknown identities excluded.
 const records=(source,predicate)=>{const counts=new Map();for(const r of source)if(known(r.driver)&&predicate(r)){const id=r.driverKey;const old=counts.get(id)||{name:r.driver,count:0};old.count++;counts.set(id,old);}return [...counts.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));};
 for(const [title,source,predicate,label] of [
  ['Most podiums',races,r=>finished(r)&&r.position<=3,'podium finishes'],
  ['Qualifying benchmark',qualis,r=>finished(r)&&r.position===1,'qualifying P1s'],
  ['Most recorded appearances',races,()=>true,'recorded race entries']
 ]){const ranked=records(source,predicate);if(ranked.length){const count=ranked[0].count,names=ranked.filter(r=>r.count===count).map(r=>r.name);talk.push({title,text:names.join(', ')+(names.length===1?' has ':' share ')+count+' '+label+' here.',source:'Completed venue sessions · this series only'});}}
 const validLaps=races.filter(r=>r.fastest>0&&known(r.driver)).sort((a,b)=>a.fastest-b.fastest);
 if(validLaps.length){const r=validLaps[0],ms=r.fastest;const time=Math.floor(ms/60000)+':'+((ms%60000)/1000).toFixed(3).padStart(6,'0');talk.push({title:'Fastest archived race lap',text:r.driver+' recorded '+time+' in '+r.seasonName.trim()+'.',source:'Recorded race laps · layouts and game versions may differ'});}
 const visits=new Map();for(const r of recent){const id=r.seasonId+':'+r.session;if(!visits.has(id))visits.set(id,[]);visits.get(id).push(r);}
 const raceHistory=[...visits.values()].slice(0,6).map(entries=>{const first=entries[0],classified=entries.filter(finished).sort((a,b)=>a.position-b.position);return {season:first.seasonName,date:first.date,caption:first.caption,entries:entries.length,podium:classified.filter(r=>r.position<=3).map(r=>({name:r.driver,position:r.position,className:r.className})),retirements:entries.filter(r=>/dnf|retir|dns|dsq|disqual/i.test(r.status||'')).length};});
 const currentSorted=[...entrants].sort((a,b)=>a.position-b.position);
 if(currentSorted.length&&(key||!currentSorted.some(d=>d.classInfo?.name))){
  const first=currentSorted[0],second=currentSorted[1];const numericPoints=d=>{const p=d?.points?.formatted??d?.points;return typeof p==='number'?p:typeof p==='string'&&/^[-+]?\d+(?:[.,]\d+)?$/.test(p.trim())?Number(p.trim().replace(',','.')):NaN;};const gap=numericPoints(first)-numericPoints(second);
  if(second&&Number.isFinite(gap)&&gap>=0)talk.push({title:'Championship picture',text:`${first.driverName} leads ${second.driverName} by ${gap} point${gap===1?'':'s'} in the saved standings.`,source:current.name});
 }
 const mover=[...cards].filter(c=>c.bestGain>0).sort((a,b)=>b.bestGain-a.bestGain)[0];
 if(mover)talk.push({title:'Through the field',text:`${mover.name} has gained ${mover.bestGain} places from grid to classification in a recorded finish here.`,source:'Saved grid and classification'});
 return {cards,talk,raceHistory,venueWinners,lastRace: lastRace.slice(0,3),raceCount:raceIds.size,driverStarts:races.length,scopeCount:scope.length,layouts:[...new Set(rows.map(r=>r.layout).filter(Boolean))],rows,sourceTimes:scope.map(s=>s.importedAt)};
}


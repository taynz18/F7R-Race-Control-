import {circuitFor} from './circuits.js';
import {teamFor} from './teams.js?v=0.3.1';
import {driverName} from './model.js?v=0.5.1';
export function mapGeometry(data){
 const points=(data?.track_map?.points||[]).filter(p=>Number.isInteger(p.i)&&Number.isFinite(p.x)&&Number.isFinite(p.z)).slice(0,192);
 const drivers=(data?.drivers||[]).filter(d=>!d.motion_stale&&d.world_position&&Number.isFinite(d.world_position.x)&&Number.isFinite(d.world_position.z));
 const all=[...points,...drivers.map(d=>d.world_position)];
 if(!all.length)return {points:[],drivers:[],paths:[],project:()=>null};
 const xs=all.map(p=>p.x),zs=all.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
 const scale=Math.min(860/Math.max(100,maxX-minX),380/Math.max(100,maxZ-minZ));
 const project=p=>({x:480+(p.x-(minX+maxX)/2)*scale,y:230-(p.z-(minZ+maxZ)/2)*scale});
 const ordered=[...points].sort((a,b)=>a.i-b.i),paths=[];let line=[];
 for(const p of ordered){if(line.length&&p.i-line.at(-1).i>2){paths.push(line);line=[]}line.push(p)}
 if(line.length)paths.push(line);
 // Close the start/finish gap only after both ends have actually been recorded.
 if(paths.length&&ordered.length>180&&ordered[0].i===0&&ordered.at(-1).i===191)paths.push([ordered.at(-1),ordered[0]]);
 return {points,drivers,paths,project};
}
const NS='http://www.w3.org/2000/svg';
function svgNode(name,attrs={}){const n=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n}
export function renderTrackMap(data,{selected=null,onSelect=()=>{},race=null,stale=false,demo=false}={}){
 const wrap=document.createElement('div'),meta=circuitFor(data?.track_id),geo=mapGeometry(data);
 const head=document.createElement('div');head.className='track-map-heading';
 if(meta.logo){const logo=document.createElement('img');logo.src='./assets/circuits/'+meta.logo;logo.alt=meta.name+' circuit logo';head.append(logo)}
 const copy=document.createElement('div'),title=document.createElement('h2'),note=document.createElement('p');
 title.textContent=meta.name+' · track map';
 note.textContent=demo?'DESIGN DEMO · illustrative layout and simulated driver positions':stale?'LAST KNOWN POSITIONS · receiver feed is stale':geo.drivers.length?geo.drivers.length+' cars located · '+Math.round(geo.points.length/192*100)+'% of circuit mapped':'Waiting for position packets · use the updated receiver';
 copy.append(title,note);head.append(copy);wrap.append(head);
 const svg=svgNode('svg',{viewBox:'0 0 960 460',class:'track-map-svg',role:'group','aria-label':meta.name+' driver positions'});
 for(const line of geo.paths){if(line.length<2)continue;const p=line.map(geo.project);svg.append(svgNode('polyline',{points:p.map(v=>v.x.toFixed(2)+','+v.y.toFixed(2)).join(' '),fill:'none',stroke:'#5f6c82','stroke-width':9,'stroke-linecap':'round','stroke-linejoin':'round'}))}
 if(!geo.drivers.length){const message=svgNode('text',{x:480,y:230,'text-anchor':'middle',fill:'#a4afc2','font-size':18});message.textContent='Waiting for live car positions';svg.append(message)}
 // Selected car is drawn last so it remains visible in a crowded grid.
 for(const d of [...geo.drivers].sort((a,b)=>(a.slot===selected)-(b.slot===selected))){
  const point=geo.project(d.world_position),team=teamFor(d.team_id),name=driverName(d,race);
  const group=svgNode('g',{class:'track-driver'+(d.slot===selected?' selected':''),transform:'translate('+point.x.toFixed(2)+' '+point.y.toFixed(2)+')',tabindex:0,role:'button','aria-label':'Inspect '+name+' · P'+(d.position||'—')});
  const tooltip=svgNode('title');tooltip.textContent='P'+(d.position||'—')+' · '+name+' · '+team.name+(d.pit_status?' · PIT':'');
  group.append(tooltip,svgNode('circle',{r:d.slot===selected?15:11,fill:team.color,stroke:d.slot===selected?'#ffffff':'#0b0d12','stroke-width':d.slot===selected?3:2}));
  const number=svgNode('text',{'text-anchor':'middle',dy:4,fill:'#ffffff','font-size':10,'font-weight':700,'paint-order':'stroke',stroke:'#10141c','stroke-width':2});number.textContent=d.position||'·';group.append(number);
  group.onclick=()=>onSelect(d.slot);group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(d.slot)}};svg.append(group);
 }
 if(stale)svg.classList.add('stale');
 wrap.append(svg);
 const foot=document.createElement('p');foot.className='track-map-foot';foot.textContent='Team colours · numbers show race position · select a dot to inspect a driver. '+(demo?'Demonstration only.':'Outline builds as cars cover the circuit; gaps mean unrecorded sections.');wrap.append(foot);
 return wrap;
}

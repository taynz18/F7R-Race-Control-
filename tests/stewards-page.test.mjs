import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {filterChannels} from '../dashboard/channel-search.js';
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.value='';this.hidden=false;this.dataset={};}
 get options(){return this.children;}remove(index){this.children.splice(index,1);}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;this.value='';}add(option){if(!this.children.length)this.value=option.value;this.children.push(option);}scrollIntoView(){}
}
test('steward page shows private evidence, voting and leader-only tie controls',async()=>{
 const html=await readFile(new URL('../stewards.html',import.meta.url),'utf8'),elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const el=id=>{assert.ok(elements.has(id),'Missing page element '+id);return elements.get(id);};
 const id='11111111-1111-4111-8111-111111111111',actor='123456789012345678';
 const route={id:'t1',config:{name:'Tier 1',default_set:'F1'}};
 const c={id,number:1001,route_id:'t1',reporter_id:'223456789012345678',accused_id:'323456789012345678',data:{race:'Monza',lap:'Lap 1',report:{statement:'Report text',links:['https://example.com/report']},defence:{statement:'Defence text',links:[]}},status:'voting',votes:{},comments:[],notifications:{},revision:1};
 let leader=false;
 const context={document:{getElementById:el,createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),querySelectorAll:()=>[]},sessionStorage:{getItem:()=> 'a'.repeat(64),setItem(){},removeItem(){}},location:{hash:'',pathname:'/stewards.html'},history:{replaceState(){}},URL,URLSearchParams,Date,console,window:{confirm:()=>true,F7RAuth:{options:()=>({})},supabase:{createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'admin-jwt'}}})}})}},Option:function(text,value){return {textContent:text,value};},fetch:async(url,options)=>{
   if(url==='config.json')return Response.json({supabase_url:'https://api.test',supabase_publishable_key:'test'});
   const input=JSON.parse(options.body);
   if(input.action==='list')return Response.json({driverId:actor,admin:false,routes:[route],cases:[{...c,race:c.data.race,lap:c.data.lap}]});
   if(input.action==='case')return Response.json({incident:c,access:{leader,steward:true,route},penalties:['No further action','5 seconds'],tally:{count:0,totals:{},winners:['5 seconds','Warning']}});
   throw Error('Unexpected action '+input.action);
 }};
 context.filterChannels=filterChannels;
 vm.createContext(context);const code=(await readFile(new URL('../dashboard/stewards.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
 await vm.runInContext('(async()=>{'+code+';globalThis.testCase=loadCase;})()',context);
 assert.equal(el('workspace').hidden,false);assert.equal(el('case-list').children.length,1);
 await context.testCase(id);assert.equal(el('report-text').textContent,'Report text');assert.equal(el('defence-text').textContent,'Defence text');assert.equal(el('vote-form').hidden,false);assert.equal(el('approval').hidden,true);
 leader=true;c.status='tied';await context.testCase(id);assert.equal(el('approval').hidden,false);assert.equal(el('tie-choice').hidden,false);assert.equal(el('vote-form').hidden,true);
 c.status='closed';c.outcome='5 seconds';c.explanation='Approved explanation';c.notifications={reporter:'sent',accused:'failed_or_unverified'};await context.testCase(id);assert.equal(el('decision').hidden,false);assert.match(el('delivery').textContent,/failed_or_unverified/);assert.equal(el('comment-form').hidden,true);
 c.data.reporter_verdict={status:'voting',penalty_set:'F1',votes:{[actor]:{penalty:'Warning',reason:'Reporting driver vote only'}},notifications:{}};
 el('verdict-target').value='reporter';await el('verdict-target').onchange();assert.match(el('verdict-heading').textContent,/reporting driver/);assert.equal(el('vote-form').hidden,false);assert.equal(el('decision').hidden,true);
 el('verdict-target').value='accused';await el('verdict-target').onchange();assert.equal(el('decision-outcome').textContent,'5 seconds');assert.equal(el('vote-form').hidden,true);
 c.data.third={driver_id:'423456789012345678',name:'Third driver',role:'involved',locked:true,statement:'Third account',links:['https://example.com/third']};c.data.third_verdict={status:'voting',penalty_set:'F1',votes:{},notifications:{}};
 el('verdict-target').value='third';await el('verdict-target').onchange();assert.equal(el('third-section').hidden,false);assert.equal(el('third-text').textContent,'Third account · Submitted and locked');assert.match(el('verdict-heading').textContent,/third driver/);assert.equal(el('vote-form').hidden,false);assert.equal(el('reporter-reason').hidden,true);
 el('verdict-target').value='accused';await el('verdict-target').onchange();
 c.status='discussion';c.data.kind='penalty_appeal';c.data.original_penalty='10 seconds';await context.testCase(id);assert.equal(el('defence-section').hidden,true);assert.equal(el('start-form').hidden,true);assert.equal(el('approval').hidden,false);assert.match(el('close-vote').textContent,/Decide appeal/);assert.equal(el('tie-choice').children.length,2);
});

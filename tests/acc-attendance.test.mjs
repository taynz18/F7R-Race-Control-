import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../supabase/functions/f7r-discord-attendance/index.js',import.meta.url),'utf8');
const declarations=source.slice(source.indexOf('const accModels'),source.indexOf('const lmuClasses'));
const builder=source.slice(source.indexOf('    const accKey'),source.indexOf('    const buildRaceTeams'));
test('ACC attendance contains only mapped roles, not every game model',()=>{const context={};vm.createContext(context);vm.runInContext(declarations+`\nconst normalize=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();const config={cars:[]},savedEmojis={},emojis=[];const roles=accRoleAliases.filter(([name])=>name!=='Ferrari 296 ACC').map(([name],i)=>({id:String(100+i),name}));`+builder+'\nglobalThis.teams=buildAccTeams([],null);',context);assert.equal(context.teams.length,15);assert.ok(context.teams.every(t=>t.ids.length===1));assert.equal(context.teams.filter(t=>t.name.includes('McLaren')).length,2);assert.equal(context.teams.filter(t=>t.name.includes('Porsche')).length,2);assert.ok(!context.teams.some(t=>/Bentley|Jaguar|Reiter/.test(t.name)));});
test('regular ACC posts use two seats while open events stay flexible',()=>{assert.ok(source.includes('twoSeats:(isAcc || isLmu && series==="WEC") && !openEntry'));assert.ok(source.includes('p_f1:isFormula(postConfig.game) || Boolean(postConfig.twoSeats)'));const interactions=fs.readFileSync(new URL('../supabase/functions/f7r-discord-interactions/index.js',import.meta.url),'utf8');assert.ok(interactions.includes('p_f1:["F1","F2"].includes(config.game) || Boolean(config.twoSeats)'));});

test('Honda ACC role selects exactly the NSX GT3 and exposes its logo and saved emoji',()=>{
 const context={};vm.createContext(context);vm.runInContext(declarations+`\nconst normalize=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();const config={cars:[]},savedEmojis={'GT3 · Honda NSX GT3':'999'},emojis=[],roles=[{id:'123',name:'HONDA NSX GT3 ACC'}];`+builder+'\nglobalThis.teams=buildAccTeams([],null);',context);
 assert.equal(context.teams.length,1);assert.equal(context.teams[0].name,'GT3 · Honda NSX GT3');assert.equal(context.teams[0].ids[0],'123');assert.equal(context.teams[0].logo,'honda');assert.ok(!context.teams.some(t=>t.name.includes('Evo')));
});

test('Honda is not added without a matching role or into a different scoped lineup',()=>{
 for(const scoped of [false,true]){const context={};vm.createContext(context);vm.runInContext(declarations+`\nconst normalize=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();const config={cars:${scoped?"[{name:'BMW M4 GT3',roleId:'456',lineupRoleId:'lineup'}]":"[]"}},savedEmojis={},emojis=[],roles=${scoped?"[{id:'123',name:'HONDA NSX GT3 ACC'}]":"[]"};`+builder+`\nglobalThis.teams=buildAccTeams([],${scoped?"'lineup'":"null"});`,context);assert.equal(context.teams.length,0);}
});


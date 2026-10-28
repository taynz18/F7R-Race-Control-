import {readFileSync} from 'node:fs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {teamFor} from '../dashboard/teams.js';
test('Season Pack 16-bit IDs distinguish Audi, Cadillac and base-game Sauber',()=>{assert.equal(teamFor(476).name,'Mercedes');assert.equal(teamFor(484).name,'McLaren');assert.equal(teamFor(485).name,'Audi');assert.equal(teamFor(486).name,'Cadillac');assert.equal(teamFor(9).name,'Sauber')});
test('unknown team identifiers stay neutral and do not become file paths',()=>{for(const id of [null,undefined,999,'../../file.png','484'])assert.equal(teamFor(id).key,'unknown');assert.equal(teamFor(483).logo,'haas.png')});

test('all F2 teams map consistently across supported seasons and carry local logos',()=>{
 const expected=[["art","ART Grand Prix"],["campos","Campos Racing"],["rodin","Rodin Motorsport"],["aix","AIX Racing"],["dams","DAMS Lucas Oil"],["hitech","Hitech"],["mp","MP Motorsport"],["prema","PREMA Racing"],["trident","Trident"],["var","Van Amersfoort Racing"],["invicta","Invicta Racing"]];
 expected.forEach(([key,name],i)=>{for(const id of [158+i,465+i,489+i]){const t=teamFor(id);assert.equal(t.key,'f2_'+key);assert.equal(t.name,name);assert.equal(t.logo,'f2-'+key+'.png');assert.equal(t.series,'F2');assert.match(t.color,/^#[0-9A-F]{6}$/)}});
 assert.equal(teamFor(476).series,'F1');assert.equal(teamFor(168).name,'Invicta Racing');assert.equal(teamFor(468).name,'AIX Racing');
});

test('every F2 logo is a real PNG asset',()=>{for(const id of Array.from({length:11},(_,i)=>465+i)){const logo=teamFor(id).logo;const bytes=readFileSync(new URL('../assets/teams/'+logo,import.meta.url));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a')}});

test('actual F7R 2026 F2 feed IDs resolve to their correct identities and assets',()=>{
 for(const [id,key] of [[489,'art'],[490,'campos'],[491,'rodin'],[492,'aix'],[493,'dams'],[494,'hitech'],[495,'mp'],[496,'prema'],[497,'trident'],[498,'var'],[499,'invicta']]){
 const t=teamFor(id);assert.equal(t.key,'f2_'+key);assert.equal(t.series,'F2');assert.equal(t.logo,'f2-'+key+'.png');assert.notEqual(t.color,teamFor(999).color)
 }
 assert.equal(teamFor(487).key,'unknown');assert.equal(teamFor(488).key,'unknown');
 assert.equal(teamFor(484).name,'McLaren');assert.equal(teamFor(486).name,'Cadillac');
});

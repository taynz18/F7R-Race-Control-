import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {attendanceLogo} from '../dashboard/attendance-branding.js';
test('full ACC car names all resolve to real manufacturer logos',()=>{
 const names=['Aston Martin Vantage GT3','Audi R8 GT3','BMW M4 GT3','Ferrari 296 GT3','Ferrari 488 GT3','Ford Mustang GT3','Lamborghini Huracán GT3','Lexus RC F GT3','McLaren 720S GT3','McLaren 720S GT3 Evo','Porsche 911 GT3 R (992)','Porsche 911 GT3 R','Nissan GT-R Nismo GT3','Mercedes-AMG GT3','Honda NSX GT3'];
 for(const name of names){const logo=attendanceLogo({name:'GT3 · '+name});assert.ok(logo,name);assert.ok(fs.existsSync(new URL('../'+logo.split('?')[0],import.meta.url)),logo);}
 assert.equal(attendanceLogo({name:'GT3 · McLaren 720S GT3 Evo'}),'assets/teams/mclaren.png');
 assert.equal(attendanceLogo({name:'GT3 · Honda NSX GT3'}),'assets/teams/honda.png?v=user-logo1');
});
test('short names, other series and explicit logos remain supported without logos for reserve groups',()=>{
 assert.equal(attendanceLogo({name:'BMW'}),'assets/teams/bmw.png');
 assert.equal(attendanceLogo({name:'Hypercar · Toyota GR010'}),'assets/teams/factory/toyota.png');
 assert.equal(attendanceLogo({name:'LMGT3 · Chevrolet Corvette'}),'assets/teams/chevrolet.svg');
 assert.equal(attendanceLogo({name:'ART Grand Prix',logo:'f2-art'}),'assets/teams/f2-art.png');
 assert.equal(attendanceLogo({name:'Reserves'}),null);
 assert.equal(attendanceLogo({name:'Unknown',logo:'../private'}),null);
});

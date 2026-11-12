import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveTeam,WEC_LOGOS} from '../dashboard/wec-logos.js';
test('WEC entries keep their specific logos across season years',()=>{assert.equal(resolveTeam('Team WRT',{uniqueId:'wrt.46.2026'}).logo,WEC_LOGOS['wrt.46']);assert.equal(resolveTeam('AF Corse',{uniqueId:'afcorse.83.2026'}).logo,WEC_LOGOS['afcorse.83']);assert.equal(resolveTeam('BMW M4 LMU',{origin:'BMW'}).logo,WEC_LOGOS['bmw.15']);assert.equal(resolveTeam('Ferrari',{uniqueId:'ferrari.2026'}).logo,'season/ferrari.2026.png');assert.equal(resolveTeam('Unknown',{}),undefined);});
test('all 39 supplied entries resolve to real PNG files',()=>{assert.equal(Object.keys(WEC_LOGOS).length,39);for(const file of new Set(Object.values(WEC_LOGOS))){const bytes=fs.readFileSync(new URL('../assets/teams/'+file,import.meta.url));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');}});

test('historic F1 identities and manufacturer fallbacks stay distinct',()=>{assert.equal(resolveTeam('Alfa Romeo',{uniqueId:'alfa.romeo.2023'}).logo,'season/alfa.romeo.2023.png');assert.equal(resolveTeam('Sauber',{uniqueId:'sauber.2024'}).logo,'season/sauber.2024.png');assert.equal(resolveTeam('Audi',{uniqueId:'audi.2026'}).logo,'season/audi.2026.png');assert.equal(resolveTeam('Genesis GMR-001',{origin:'Genesis'}).logo,'factory/genesis.png');assert.equal(resolveTeam('Lamborghini Huracan ACC',{origin:'Lamborghini'}).logo,'factory/lamborghini.png');assert.equal(resolveTeam('AF Corse',{uniqueId:'afcorse.83.2025'}).logo,WEC_LOGOS['afcorse.83']);});



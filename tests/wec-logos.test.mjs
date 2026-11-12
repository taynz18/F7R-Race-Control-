import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveTeam,WEC_LOGOS} from '../dashboard/wec-logos.js';
test('WEC entries keep their specific logos across season years',()=>{assert.equal(resolveTeam('Team WRT',{uniqueId:'wrt.46.2026'}).logo,WEC_LOGOS['wrt.46']);assert.equal(resolveTeam('AF Corse',{uniqueId:'afcorse.83.2026'}).logo,WEC_LOGOS['afcorse.83']);assert.equal(resolveTeam('BMW M4 LMU',{origin:'BMW'}).logo,WEC_LOGOS['bmw.15']);assert.equal(resolveTeam('Ferrari',{uniqueId:'ferrari.2026'}).logo,'ferrari.png');assert.equal(resolveTeam('Unknown',{}),undefined);});
test('all 39 supplied entries resolve to real PNG files',()=>{assert.equal(Object.keys(WEC_LOGOS).length,39);for(const file of new Set(Object.values(WEC_LOGOS))){const bytes=fs.readFileSync(new URL('../assets/teams/'+file,import.meta.url));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');}});


import {test} from 'node:test';import assert from 'node:assert/strict';import {Decoder,header} from '../receiver/decoder.mjs';
function packet(id,format=2026,frame=100,uid=9007199254740993n){
 const sizes=format===2026?{0:1325,1:926,2:1399,4:1470,6:1448,7:1445,10:1133,16:269}:{0:1349,1:753,2:1285,4:1284,6:1352,7:1239,10:1041};
 const b=Buffer.alloc(sizes[id]);b.writeUInt16LE(format,0);b[5]=1;b[6]=id;b.writeBigUInt64LE(uid,7);b.writeUInt32LE(frame,23);return b;
}
function feed(format=2026,share=true,names=true){
 const dec=new Decoder(),p=packet(4,format),lap=packet(2,format),s=format===2026?3:0;p[29]=1;p[30+39+s]=+share;p[30+40+s]=+names;p[30+43+s]=4;p[30+5+s]=77;p.write('F7R Racer',30+7+s);
 lap.writeUInt32LE(90123,29);lap[61]=1;lap[62]=18;dec.accept(p,1000);dec.accept(lap,1000);return dec;
}
test('64-bit game UID remains exact',()=>assert.equal(header(packet(2)).uid,'9007199254740993'));
test('2026 participant/status/damage offsets',()=>{
 const dec=feed(),st=packet(7),dm=packet(10);st.writeFloatLE(22.5,34);st.writeFloatLE(2000000,66);st[70]=3;
 [10,20,30,40].forEach((n,i)=>dm.writeFloatLE(n,29+i*4));dm[57]=7;dm[66]=12;
 dec.accept(st,1000);dec.accept(dm,1000);const d=dec.snapshot(1100).data.drivers[0];
 assert.equal(d.name,'F7R Racer');assert.equal(d.race_number,77);assert.equal(d.platform,4);assert.equal(d.fuel_kg,22.5);assert.equal(d.ers_joules,2000000);assert.equal(d.deploy_mode,3);assert.deepEqual(d.wear,[10,20,30,40]);assert.equal(d.damage.front_left,7);assert.equal(d.damage.engine,12);assert.equal(d.last_lap_ms,90123);assert.equal(d.lap,18);
});
test('private data is null even when packet values are nonzero',()=>{const dec=feed(2026,false,false),st=packet(7),dm=packet(10);st.writeFloatLE(22.5,34);dm.writeFloatLE(50,29);dec.accept(st,1000);dec.accept(dm,1000);const d=dec.snapshot(1001).data.drivers[0];for(const key of ['fuel_kg','wear','damage','name','ers_joules'])assert.equal(d[key],null)});
test('real zero remains zero',()=>{const dec=feed();dec.accept(packet(7),1000);dec.accept(packet(10),1000);const d=dec.snapshot(1001).data.drivers[0];assert.equal(d.fuel_kg,0);assert.equal(d.damage.engine,0)});
test('missing and stale packets are not fabricated',()=>{const dec=feed();assert.equal(dec.snapshot(1001).data.drivers[0].fuel_kg,null);assert.equal(dec.snapshot(4000),null)});
test('older frames ignored',()=>{const dec=feed();assert.equal(dec.accept(packet(2,2026,99),1010),false);assert.equal(dec.snapshot(1010).data.drivers[0].lap,18)});
test('different session cannot overwrite the grid',()=>{const dec=feed();assert.throws(()=>dec.accept(packet(2,2026,101,2n)),/session changed/);assert.equal(dec.uid,'9007199254740993')});
test('invalid version, size, format rejected',()=>{assert.throws(()=>header(packet(2).subarray(0,100)),/size/);const b=packet(2);b.writeUInt16LE(2024,0);assert.throws(()=>header(b),/Unsupported/);b.writeUInt16LE(2026,0);b[5]=2;assert.throws(()=>header(b),/version/);assert.throws(()=>header(Buffer.alloc(2)),/Short/)});
test('2025 format fallback',()=>{const dec=feed(2025),st=packet(7,2025);st.writeFloatLE(44,34);dec.accept(st,1000);assert.equal(dec.snapshot(1001).data.format,2025);assert.equal(dec.snapshot(1001).data.drivers[0].fuel_kg,44)});
test('24th driver is decoded',()=>{const dec=new Decoder(),p=packet(4),l=packet(2);p[29]=24;const o=30+23*60;p[o+42]=1;p[o+43]=1;p.write('Last Driver',o+10);dec.accept(p,1000);dec.accept(l,1000);assert.equal(dec.snapshot(1001).data.drivers[23].name,'Last Driver')});
test('nonfinite sensors become null',()=>{const dec=feed(),st=packet(7);st.writeFloatLE(NaN,34);dec.accept(st,1000);assert.equal(dec.snapshot(1001).data.drivers[0].fuel_kg,null)});


for(const format of [2025,2026])test('motion positions and measured outline '+format,()=>{
 const dec=feed(format),s=packet(1,format),m=packet(0,format),l=packet(2,format,101);
 s.writeUInt16LE(5000,33);s.writeInt8(7,36);m.writeFloatLE(100,29);m.writeFloatLE(300,37);
 l.writeFloatLE(1250,49);l[61]=1;l[74]=2;
 dec.accept(s,1000);dec.accept(m,1000);dec.accept(l,1000);
 const snap=dec.snapshot(1001);assert.deepEqual(snap.data.drivers[0].world_position,{x:100,z:300});
 assert.equal(snap.data.track_map.points[0].i,48);assert.equal(snap.data.track_id,7);
 assert.equal(dec.snapshot(2600).data.drivers[0].world_position,null);
 assert.equal(dec.snapshot(2600).data.track_map.points.length,1);
});
test('pit lane and invalid coordinates cannot distort circuit trace',()=>{
 const dec=feed(),s=packet(1),m=packet(0),l=packet(2,2026,101);
 s.writeUInt16LE(5000,33);m.writeFloatLE(NaN,29);m.writeFloatLE(300,37);l[74]=2;
 dec.accept(s,1000);dec.accept(m,1000);dec.accept(l,1000);
 assert.equal(dec.snapshot(1001).data.drivers[0].world_position,null);
 assert.equal(dec.snapshot(1001).data.track_map.points.length,0);
 const next=packet(0,2026,102);next.writeFloatLE(100,29);next.writeFloatLE(300,37);l.writeUInt32LE(102,23);l[63]=1;
 dec.accept(next,1100);dec.accept(l,1100);assert.equal(dec.snapshot(1101).data.track_map.points.length,0);
});

for(const format of [2025,2026])test('visual compound, tyre age and ERS use distinct documented fields '+format,()=>{
 const dec=feed(format),status=packet(7,format);
 // Relative offsets: actual compound25, visual26, age27, flag28, ICE29, MGUK33, store37, mode41.
 status[29+25]=17;status[29+26]=16;status[29+27]=2;status[29+28]=3;
 status.writeFloatLE(123456,29+29);status.writeFloatLE(654321,29+33);
 status.writeFloatLE(2000000,29+37);status[29+41]=3;
 dec.accept(status,1000);const d=dec.snapshot(1001).data.drivers[0];
 assert.equal(d.compound,16);assert.equal(d.tyre_age,2);assert.equal(d.ers_joules,2000000);assert.equal(d.deploy_mode,3);
});
test('wear readings come from each car and each wheel rather than status bytes',()=>{
 const dec=new Decoder(),p=packet(4),l=packet(2),damage=packet(10);
 p[29]=2;for(let i=0;i<2;i++){p[30+i*60+42]=1;p[30+i*60+43]=1}
 const values=[[4.25,5.5,6.75,8],[31.25,32.5,33.75,35]];
 values.forEach((w,i)=>w.forEach((n,j)=>damage.writeFloatLE(n,29+i*46+j*4)));
 dec.accept(p,1000);dec.accept(l,1000);dec.accept(damage,1000);
 const cars=dec.snapshot(1001).data.drivers;
 assert.deepEqual(cars[0].wear,values[0]);assert.deepEqual(cars[1].wear,values[1]);
});
test('restricted driver tyre age is not exposed',()=>{
 const dec=feed(2026,false,false),status=packet(7);status[29+27]=16;
 dec.accept(status,1000);assert.equal(dec.snapshot(1001).data.drivers[0].tyre_age,null);
});

// F1 25 UDP format 2025 and F1 25: 2026 Season Pack format 2026.
// Independently implemented from EA's published structures. Wheel order: RL RR FL FR.
const layouts={
  2025:{cars:22,sizes:{1:753,2:1285,4:1284,6:1352,7:1239,10:1041},participant:57,status:55,telemetry:60},
  2026:{cars:24,sizes:{1:926,2:1399,4:1470,6:1448,7:1445,10:1133,16:269},participant:60,status:59,telemetry:59}
};
const finite=(n,min=-1e6,max=1e6)=>Number.isFinite(n)&&n>=min&&n<=max?n:null;
export function header(b){
  if(!Buffer.isBuffer(b)||b.length<29)throw Error('Short UDP header');
  const format=b.readUInt16LE(0),layout=layouts[format];
  if(!layout)throw Error('Unsupported UDP format: '+format);
  const id=b[6];if(!(id in layout.sizes))return null;
  if(b[5]!==1||b.length!==layout.sizes[id])throw Error('Unexpected packet version or size for '+format+'/'+id);
  return {format,id,uid:b.readBigUInt64LE(7).toString(),frame:b.readUInt32LE(23),layout};
}
export class Decoder{
  constructor(){this.uid=null;this.format=null;this.parts=new Map();this.frame=-1;}
  accept(b,now=Date.now()){
    const h=header(b);if(!h)return false;
    if(this.uid && (this.uid!==h.uid || this.format!==h.format))throw Error('Game session changed. Create a new F7R race and restart the receiver.');
    const old=this.parts.get(h.id);
    if(old && h.frame<=old.frame)return false;
    this.uid=h.uid;this.format=h.format;this.frame=Math.max(this.frame,h.frame);
    this.parts.set(h.id,{b:Buffer.from(b),frame:h.frame,at:now});return true;
  }
  snapshot(now=Date.now()){
    const fresh=(id,ttl=2500)=>{const p=this.parts.get(id);return p&&now-p.at<=ttl?p.b:null};
    const p=fresh(4,15000),lap=fresh(2);
    if(!p||!lap)return null;
    const layout=layouts[this.format],status=fresh(7),damage=fresh(10),tel=fresh(6),extra=fresh(16),session=fresh(1,15000);
    const drivers=[];
    for(let i=0;i<Math.min(p[29],layout.cars);i++){
      const o=30+i*layout.participant,is26=this.format===2026,shift=is26?3:0;
      const ai=p[o]===1,publicData=p[o+39+shift]===1,showName=p[o+40+shift]===1;
      const raw=p.subarray(o+7+shift,o+39+shift).toString('utf8').split('\0')[0].replace(/[\u0000-\u001f]/g,'').trim();
      const l=29+i*57,s=29+i*layout.status,d=29+i*46,t=29+i*layout.telemetry,e=29+i*10;
      const shared=ai||publicData;
      const car={slot:i,network_id:is26?p.readUInt16LE(o+3):p[o+2],team_id:is26?p.readUInt16LE(o+5):p[o+3],
        race_number:p[o+5+shift],platform:p[o+43+shift],name:(ai||showName)?raw:null,
        name_shared:ai||showName,telemetry_public:shared,position:lap[l+32],lap:lap[l+33],
        last_lap_ms:lap.readUInt32LE(l),current_lap_ms:lap.readUInt32LE(l+4),
        sector1_ms:lap.readUInt16LE(l+8)+lap[l+10]*60000,sector2_ms:lap.readUInt16LE(l+11)+lap[l+13]*60000,
        gap_ms:lap.readUInt16LE(l+17)+lap[l+19]*60000,pit_status:lap[l+34],penalties:lap[l+38],
        result_status:lap[l+45],speed_kph:tel?tel.readUInt16LE(t):null,
        compound:status?status[s+25]:null,tyre_age:status?status[s+26]:null,
        fuel_kg:shared&&status?finite(status.readFloatLE(s+5),0,200):null,
        fuel_laps:shared&&status?finite(status.readFloatLE(s+13),-100,200):null,
        ers_joules:shared&&status?finite(status.readFloatLE(s+36),0,1e8):null,
        // Percentage calibration is configurable in the receiver for changed regulations.
        ers_percent:null,deploy_mode:shared&&status?status[s+40]:null,
        wear:shared&&damage?Array.from({length:4},(_,j)=>finite(damage.readFloatLE(d+j*4),0,100)):null,
        damage:shared&&damage?{front_left:damage[d+28],front_right:damage[d+29],rear:damage[d+30],floor:damage[d+31],engine:damage[d+37]}:null,
        overtake_active:extra?extra[e+5]===1:null,active_aero:extra?extra[e]:null,
        status_stale:!status,damage_stale:!damage};
      drivers.push(car);
    }
    return {game_uid:this.uid,frame:this.frame,data:{format:this.format,drivers,
      weather:session?session[29]:null,track_temperature:session?session.readInt8(30):null,
      total_laps:session?session[32]:null,track_id:session?session.readInt8(36):null}};
  }
}


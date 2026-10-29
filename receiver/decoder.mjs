// F1 25 UDP format 2025 and F1 25: 2026 Season Pack format 2026.
// Independently implemented from EA's published structures. Wheel order: RL RR FL FR.
const layouts={
  2025:{cars:22,sizes:{0:1349,1:753,2:1285,4:1284,6:1352,7:1239,10:1041},participant:57,status:55,telemetry:60},
  2026:{cars:24,sizes:{0:1325,1:926,2:1399,4:1470,6:1448,7:1445,10:1133,16:269},participant:60,status:59,telemetry:59}
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
  constructor(){this.uid=null;this.format=null;this.parts=new Map();this.frame=-1;this.mapPoints=new Map();this.mapTrack=null;}
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
    const motion=fresh(0,1500),sessionPacket=fresh(1,15000),trackLength=sessionPacket?.readUInt16LE(33)||null,trackId=sessionPacket?.readInt8(36)??null;
    if(trackId!==null&&this.mapTrack!==trackId){this.mapPoints.clear();this.mapTrack=trackId;}
    const layout=layouts[this.format],status=fresh(7),damage=fresh(10),tel=fresh(6),extra=fresh(16),session=fresh(1,15000);
    const safetySession=fresh(1);
    const marshalZones=safetySession?Array.from({length:Math.min(safetySession[48],21)},(_,i)=>({start:finite(safetySession.readFloatLE(49+i*5),0,1),flag:safetySession.readInt8(53+i*5)})).filter(z=>z.start!==null&&z.flag>=-1&&z.flag<=3):null;
    const metadata=this.parts.get(1)?.b;
    const drivers=[];
    for(let i=0;i<Math.min(p[29],layout.cars);i++){
      const o=30+i*layout.participant,is26=this.format===2026,shift=is26?3:0;
      const ai=p[o]===1,publicData=p[o+39+shift]===1,showName=p[o+40+shift]===1;
      const raw=p.subarray(o+7+shift,o+39+shift).toString('utf8').split('\0')[0].replace(/[\u0000-\u001f]/g,'').trim();
      const l=29+i*57,s=29+i*layout.status,d=29+i*46,t=29+i*layout.telemetry,e=29+i*10;
      const shared=ai||publicData;
      const mo=29+i*(this.format===2026?54:60),x=motion?finite(motion.readFloatLE(mo),-100000,100000):null,z=motion?finite(motion.readFloatLE(mo+8),-100000,100000):null;
      const validPosition=x!==null&&z!==null&&(x!==0||z!==0)&&lap[l+45]!==0&&lap[l+45]!==1;
      const distance=finite(lap.readFloatLE(l+20),-10000,100000);
      if(validPosition&&trackLength>0&&distance!==null&&distance>=0&&distance<trackLength&&lap[l+34]===0){
        const bin=Math.min(191,Math.floor(distance/trackLength*192));
        this.mapPoints.set(bin,{i:bin,x:Math.round(x*10)/10,z:Math.round(z*10)/10});
      }
      const car={slot:i,network_id:is26?p.readUInt16LE(o+3):p[o+2],team_id:is26?p.readUInt16LE(o+5):p[o+3],
        race_number:p[o+5+shift],platform:p[o+43+shift],name:(ai||showName)?raw:null,
        world_position:validPosition?{x,z}:null,lap_distance:distance,motion_stale:!motion,
        name_shared:ai||showName,telemetry_public:shared,position:lap[l+32],lap:lap[l+33],
        last_lap_ms:lap.readUInt32LE(l),current_lap_ms:lap.readUInt32LE(l+4),
        sector1_ms:lap.readUInt16LE(l+8)+lap[l+10]*60000,sector2_ms:lap.readUInt16LE(l+11)+lap[l+13]*60000,
        gap_ms:lap.readUInt16LE(l+17)+lap[l+19]*60000,pit_status:lap[l+34],penalties:lap[l+38],
        result_status:lap[l+45],speed_kph:tel?tel.readUInt16LE(t):null,
        compound:status?status[s+26]:null,tyre_age:shared&&status?status[s+27]:null,
        fuel_kg:shared&&status?finite(status.readFloatLE(s+5),0,200):null,
        fuel_laps:shared&&status?finite(status.readFloatLE(s+13),-100,200):null,
        ers_joules:shared&&status?finite(status.readFloatLE(s+37),0,1e8):null,
        // Percentage calibration is configurable in the receiver for changed regulations.
        ers_percent:null,deploy_mode:shared&&status?status[s+41]:null,
        wear:shared&&damage?Array.from({length:4},(_,j)=>finite(damage.readFloatLE(d+j*4),0,100)):null,
        damage:shared&&damage?{front_left:damage[d+28],front_right:damage[d+29],rear:damage[d+30],floor:damage[d+31],engine:damage[d+37]}:null,
        overtake_active:extra?extra[e+5]===1:null,active_aero:extra?extra[e]:null,
        status_stale:!status,damage_stale:!damage};
      drivers.push(car);
    }
    return {game_uid:this.uid,frame:this.frame,data:{format:this.format,drivers,
      session_type:metadata&&metadata[35]>=1&&metadata[35]<=18?metadata[35]:null,
      formula:metadata?metadata[37]:null,
      track_length:trackLength,track_map:{bins:192,points:[...this.mapPoints.values()].sort((a,b)=>a.i-b.i)},
      weather:session?session[29]:null,track_temperature:session?session.readInt8(30):null,
      // EA PacketSessionData: 21 packed five-byte marshal zones precede safetyCarStatus.
      safety_car_status:safetySession&&safetySession[154]<=3?safetySession[154]:null,
      marshal_zones:marshalZones,
      total_laps:session?session[32]:null,track_id:session?session.readInt8(36):null}};
  }
}


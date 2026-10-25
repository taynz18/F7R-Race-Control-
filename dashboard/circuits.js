// Official 2026 F1 calendar circuit names, matched to EA UDP track IDs.
// Supplied artwork is circuit branding; the outline comes from game coordinates.
const rows=[
[0,'Melbourne','melbourne'],[2,'Shanghai','shanghai'],[3,'Bahrain','bahrain'],
[4,'Barcelona-Catalunya','barcelona'],[5,'Monaco','monaco'],[6,'Montreal','montreal'],
[7,'Silverstone','silverstone'],[9,'Hungaroring','hungaroring'],[10,'Spa-Francorchamps','spa-francorchamps'],
[11,'Monza','monza'],[12,'Singapore',null],[13,'Suzuka','suzuka'],[14,'Yas Marina','yas_marina'],
[15,'Circuit of the Americas','cota'],[16,'Interlagos','interlagos'],[17,'Red Bull Ring','spielberg'],
[19,'Mexico City','mexico'],[20,'Baku','baku'],[26,'Zandvoort','zandvoort'],
[29,'Jeddah','jeddah'],[30,'Miami','miami'],[31,'Las Vegas',null],[32,'Lusail','losail']
];
export const CIRCUITS=rows.map(([id,name,logo])=>({id,name,logo:logo?logo+'.png':null}));
export function circuitFor(id){return CIRCUITS.find(c=>c.id===id)||{id,name:id===null||id===undefined?'Waiting for circuit':'Circuit '+id,logo:null};}
export const CALENDAR_SOURCE='https://www.formula1.com/en/racing/2026';

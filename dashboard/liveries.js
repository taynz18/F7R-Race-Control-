import {LIVERIES} from './livery-catalog.js';
const key=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const folders=['f1_2026','wec_2026','gt3','elms_2025'];
const find=(id,preferred=folders)=>{for(const folder of preferred){const entry=Object.keys(LIVERIES).find(k=>k.startsWith(folder+'/')&&key(k.split('/')[1])===key(id));if(entry)return './assets/liveries/'+LIVERIES[entry];}return null;};
// Exact source IDs take precedence. Model aliases never collapse manufacturer variants.
const models={bmwmhybridv8:'bmw.m.hybridv8',bmwmhybridv8evo:'bmw.m.hybridv8.evo',cadillacvseriesr:'cadillac.vseriesr',cadillacvseriesrevo:'cadillac.vseriesr.evo',ferrari499p:'ferrari.499p',alpinea424:'alpine.a424',astonmartinvalkyrie:'aston.valkyrie.lmh',astonmartinvalkyrieamrlmh:'aston.valkyrie.lmh',porsche963:'porsche.963',toyotagr010hybrid:'toyota.gr010h',genesisgmr001:'genesis.gmr.001',peugeot9x8:'peugeot.9x8',lamborghinisc63:'lamborghini.sc63',oreca07:'oreca.07.20',oreca07gibson:'oreca.07.20',ferrari296gt3:'ferrari.296.gt3',ferrari488gt3:'ferrari.488.gt3',ferrari488gt3evo:'ferrari.488.gt3.evo',bmwm4gt3:'bmw.m4.gt3',bmwm6gt3:'bmw.m6.gt3',mclaren720sgt3:'mclaren.720s.gt3',mclaren720sgt3evo:'mclaren.720s.gt3.evo',mclaren650sgt3:'mclaren.650s.gt3',audir8lmsgt3:'audi.r8.lms',audir8lmsgt3evo:'audi.r8.lms.evo',audir8lmsgt3evoii:'audi.r8.lms.evo2',audir8lmsgt3evo2:'audi.r8.lms.evo2',porsche991gt3r:'porsche.991.gt3.r',porsche991iigt3r:'porsche.991.2.gt3.r',porsche992gt3r:'porsche.992.gt3.r',fordmustanggt3:'ford.mustang.gt3',lexusrcfgt3:'lexus.rcf.gt3',mercedesamggt3:'mercedes.amg.gt3',mercedesamggt3evo:'mercedes.gt3.evo.2020',chevroletcorvettez06gt3r:'chevrolet.corvette.z06.gt3r'};
export function resolveLivery(name,info={},car={}){
 for(const id of [info?.uniqueId,info?.origin]){if(typeof id==='string'){const exact=find(id);if(exact)return exact;}}
 for(const value of [car?.carName,info?.car?.carName,typeof info?.car==='string'?info.car:null,name]){if(!value)continue;const exact=find(value,['gt3','wec_2026']);if(exact)return exact;const model=models[key(value)];if(model)return find(model,['gt3','wec_2026']);}
 return null;
}


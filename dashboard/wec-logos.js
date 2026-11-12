import {SEASON_LOGOS} from './season-logos.js?v=1';
// Supplied WEC team marks; entry numbers are matched independently of season year.
export const WEC_LOGOS={
  "wrt.31": "wec/wrt.31.2025.png",
  "wrt.46": "wec/wrt.31.2025.png",
  "corvette.gt3.lmu": "wec/corvette.gt3.lmu.2026.png",
  "ford.gt3.lmu": "wec/ford.gt3.lmu.2026.png",
  "lexus.lmu.gt3": "wec/lexus.lmu.gt3.2026.png",
  "af.corse.21": "wec/af.corse.21.2025.png",
  "af.corse.54": "wec/af.corse.21.2025.png",
  "afcorse.83": "wec/af.corse.21.2025.png",
  "akkodis.78": "wec/akkodis.78.2025.png",
  "akkodis.87": "wec/akkodis.78.2025.png",
  "alpine.35": "wec/alpine.35.2025.png",
  "alpine.36": "wec/alpine.35.2025.png",
  "aston.007": "wec/aston.007.2025.png",
  "aston.009": "wec/aston.007.2025.png",
  "bmw.15": "wec/bmw.15.2025.png",
  "bmw.20": "wec/bmw.15.2025.png",
  "cadillac.12": "wec/cadillac.12.2025.png",
  "cadillac.38": "wec/cadillac.12.2025.png",
  "ferrari.50": "wec/ferrari.50.2025.png",
  "ferrari.51": "wec/ferrari.50.2025.png",
  "heart.racing.27": "wec/heart.racing.27.2025.png",
  "iron.dames.85": "wec/iron.dames.85.2025.png",
  "iron.lynx.60": "wec/iron.lynx.60.2025.png",
  "iron.lynx.61": "wec/iron.lynx.60.2025.png",
  "manthey.92": "wec/manthey.92.2025.png",
  "peugeot.93": "wec/peugeot.93.2025.png",
  "peugeot.94": "wec/peugeot.93.2025.png",
  "porsche.5": "wec/porsche.5.2025.png",
  "porsche.6": "wec/porsche.5.2025.png",
  "proton.77": "wec/proton.77.2025.png",
  "proton.88": "wec/proton.77.2025.png",
  "proton.99": "wec/proton.77.2025.png",
  "spirit.lemans.10": "wec/spirit.lemans.10.2025.png",
  "tf.sport.33": "wec/tf.sport.33.2025.png",
  "tf.sport.81": "wec/tf.sport.33.2025.png",
  "toyota.7": "wec/toyota.7.2025.png",
  "toyota.8": "wec/toyota.7.2025.png",
  "united.59": "wec/united.59.2025.png",
  "united.95": "wec/united.59.2025.png"
};

import {TEAMS} from './teams.js?v=0.14.0';
const clean=v=>String(v||'').trim().toLowerCase();
const brandFiles={bmw:'bmw.15',ford:'ford.gt3.lmu',lexus:'lexus.lmu.gt3',corvette:'corvette.gt3.lmu',chevrolet:'corvette.gt3.lmu',peugeot:'peugeot.93',porsche:'porsche.5',toyota:'toyota.7'};
const brands={bmw:'BMW',ford:'Ford',lexus:'Lexus',corvette:'Corvette',chevrolet:'Chevrolet',peugeot:'Peugeot',porsche:'Porsche',toyota:'Toyota'};
export function resolveTeam(name,info){
 const fullSource=clean(info?.uniqueId);
 const label=clean(name),source=clean(info?.uniqueId).replace(/\.\d{4}$/,''),teams=Object.values(TEAMS);
 const f2keys=['art','campos','rodin','aix','dams','hitech','mp','prema','trident','var','invicta'];const f2=f2keys.find(k=>source===k+'.f2'||label===k||label===k+' f2');if(f2)return TEAMS['f2_'+f2];
 const base=teams.find(t=>clean(t.name)===label)||teams.find(t=>source.startsWith(t.key+'.'))||teams.find(t=>label.startsWith(clean(t.name)+' '))||teams.find(t=>t.key===clean(info?.origin).replaceAll(' ',''));
 const aliases={'alfa romeo':'alfa.romeo','alphatauri':'alphatauri','alpha tauri':'alphatauri','sauber':'sauber','kick sauber':'sauber','aston martin':'aston.martin','red bull':'red.bull','red bull racing':'red.bull','racing bulls':'racing.bulls'};
 const historical=aliases[label]||aliases[clean(info?.origin)];
 const historicalYear=historical==='alfa.romeo'||historical==='alphatauri'?2023:historical==='sauber'?2024:null;
 const seasonal=SEASON_LOGOS[fullSource]||(historicalYear?SEASON_LOGOS[historical+'.'+historicalYear]:null);
 if(seasonal)return {...base,key:base?.key||historical||source,name:name||base?.name||info?.origin||'Team',logo:seasonal,color:base?.color||'#a8c8dc',logoLight:false};
 let logo=WEC_LOGOS[source],brand=clean(info?.origin);if(!brand)brand=Object.keys(brandFiles).find(b=>label.startsWith(b+' ')||label===b)||'';
 if(!logo&&brandFiles[brand])logo=WEC_LOGOS[brandFiles[brand]];
 if(logo){const light=/\/(?:wrt|bmw|af\.?corse|heart|iron\.lynx|manthey|proton|tf\.sport|united|alpine|cadillac)/.test(logo);return {...base,key:source||brand,name:name||info?.fullName||brands[brand]||'Team',color:base?.color||'#91c7e8',logo,logoLight:light};}
 const factoryFiles={"alfa_romeo":"factory/alfa_romeo.png","alpine":"factory/alpine.png","aston_martin":"factory/aston_martin.png","audi":"factory/audi.png","bmw":"factory/bmw.png","cadillac":"factory/cadillac.png","ferrari":"factory/ferrari.png","genesis":"factory/genesis.png","isotta_fraschini":"factory/isotta_fraschini.png","lamborghini":"factory/lamborghini.png","mclaren":"factory/mclaren.png","mercedes":"factory/mercedes.png","peugeot":"factory/peugeot.png","porsche":"factory/porsche.png","renault":"factory/renault.png","toyota":"factory/toyota.png"};
 const factoryKey=v=>clean(v).replaceAll(' ','_');let factory=factoryKey(info?.origin);if(!factoryFiles[factory])factory=Object.keys(factoryFiles).sort((a,b)=>b.length-a.length).find(k=>factoryKey(label)===k||factoryKey(label).startsWith(k+'_')||source.startsWith(k.replaceAll('_','.')+'.'));
 if(factoryFiles[factory])return {...base,key:base?.key||factory,name:name||info?.origin||factory.replaceAll('_',' '),logo:factoryFiles[factory],color:base?.color||'#a8c8dc',logoLight:false};
 return base;
}
export function styleTeamLogo(img,team){if(team?.logoLight){img.style.background='#f1f3f7';img.style.borderRadius='6px';img.style.padding='4px';img.style.boxSizing='border-box';}}


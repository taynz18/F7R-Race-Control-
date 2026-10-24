// EA UDP team identifiers: legacy/base cars and 2026 Season Pack cars.
// 2026 identifiers are 16-bit. Unknown teams keep a neutral identity.
const team=(key,name,color,accent,logo=null)=>Object.freeze({key,name,color,accent,logo});
export const TEAMS=Object.freeze({
 mercedes:team('mercedes','Mercedes','#27D9C3','#087E78','mercedes.png'),
 ferrari:team('ferrari','Ferrari','#EF3340','#86172C','ferrari.png'),
 redbull:team('redbull','Red Bull Racing','#4778FF','#172E84'),
 williams:team('williams','Williams','#438AFF','#19358C','williams.png'),
 aston:team('aston','Aston Martin','#25B69B','#075347','aston-martin.png'),
 alpine:team('alpine','Alpine','#E98EC0','#3468C2','alpine.png'),
 racingbulls:team('racingbulls','Racing Bulls','#829BFF','#2E48A8','racing-bulls.png'),
 haas:team('haas','Haas','#CFD4DF','#AF2439'),
 mclaren:team('mclaren','McLaren','#FF9A3B','#A84616','mclaren.png'),
 sauber:team('sauber','Sauber','#70E45F','#23732D'),
 audi:team('audi','Audi','#F34D57','#5D2432','audi.png'),
 cadillac:team('cadillac','Cadillac','#CDD7E6','#515E75'),
 unknown:team('unknown','Unknown team','#8C99B0','#343E50')
});
const keys=['mercedes','ferrari','redbull','williams','aston','alpine','racingbulls','haas','mclaren','sauber'];
const byId=new Map();keys.forEach((key,i)=>{byId.set(i,key);byId.set(185+i,key)});
['mercedes','ferrari','redbull','williams','aston','alpine','racingbulls','haas','mclaren','audi','cadillac'].forEach((key,i)=>byId.set(476+i,key));
export function teamFor(id){return TEAMS[byId.get(Number.isInteger(id)?id:-1)]||TEAMS.unknown}

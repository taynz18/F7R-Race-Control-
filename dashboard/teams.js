// EA UDP team identifiers: legacy/base cars and 2026 Season Pack cars.
// 2026 identifiers are 16-bit. Unknown teams keep a neutral identity.
const team=(key,name,color,accent,logo=null,series='F1')=>Object.freeze({key,name,color,accent,logo,series});
export const TEAMS=Object.freeze({
 mercedes:team('mercedes','Mercedes','#27D9C3','#087E78','mercedes.png'),
 ferrari:team('ferrari','Ferrari','#EF3340','#86172C','ferrari.png'),
 redbull:team('redbull','Red Bull Racing','#4778FF','#172E84','red-bull.png'),
 williams:team('williams','Williams','#438AFF','#19358C','williams.png'),
 aston:team('aston','Aston Martin','#25B69B','#075347','aston-martin.png'),
 alpine:team('alpine','Alpine','#E98EC0','#3468C2','alpine.png'),
 racingbulls:team('racingbulls','Racing Bulls','#829BFF','#2E48A8','racing-bulls.png'),
 haas:team('haas','Haas','#CFD4DF','#AF2439','haas.png'),
 mclaren:team('mclaren','McLaren','#FF9A3B','#A84616','mclaren.png'),
 sauber:team('sauber','Sauber','#70E45F','#23732D'),
 audi:team('audi','Audi','#F34D57','#5D2432','audi.png'),
 cadillac:team('cadillac','Cadillac','#CDD7E6','#515E75','cadillac.png'),
 f2_art:team('f2_art','ART Grand Prix','#EF4050','#821B2A','f2-art.png','F2'),
 f2_campos:team('f2_campos','Campos Racing','#FF943B','#8C3F17','f2-campos.png','F2'),
 f2_rodin:team('f2_rodin','Rodin Motorsport','#65B8FF','#21528F','f2-rodin.png','F2'),
 f2_aix:team('f2_aix','AIX Racing','#B0FF2B','#47791B','f2-aix.png','F2'),
 f2_dams:team('f2_dams','DAMS Lucas Oil','#46B9EB','#193D8C','f2-dams.png','F2'),
 f2_hitech:team('f2_hitech','Hitech TGR','#47D7B4','#1B706B','f2-hitech.png','F2'),
 f2_mp:team('f2_mp','MP Motorsport','#FF9148','#A34323','f2-mp.png','F2'),
 f2_prema:team('f2_prema','PREMA Racing','#F34C58','#871A30','f2-prema.png','F2'),
 f2_trident:team('f2_trident','Trident','#6599F5','#183578','f2-trident.png','F2'),
 f2_var:team('f2_var','Van Amersfoort Racing','#F5A346','#8D461E','f2-var.png','F2'),
 f2_invicta:team('f2_invicta','Invicta Racing','#F2E63F','#7B6D15','f2-invicta.png','F2'),
 unknown:team('unknown','Unknown team','#8C99B0','#343E50')
});
const keys=['mercedes','ferrari','redbull','williams','aston','alpine','racingbulls','haas','mclaren','sauber'];
const byId=new Map();keys.forEach((key,i)=>{byId.set(i,key);byId.set(185+i,key)});
['mercedes','ferrari','redbull','williams','aston','alpine','racingbulls','haas','mclaren','audi','cadillac'].forEach((key,i)=>byId.set(476+i,key));
// F2 2024 IDs from EA's F1 25 specification; F2 2025 IDs in the 2026 Season Pack.
// Reference: https://github.com/MacManley/f1-26-udp#team-ids
["f2_art","f2_campos","f2_rodin","f2_aix","f2_dams","f2_hitech","f2_mp","f2_prema","f2_trident","f2_var","f2_invicta"].forEach((key,i)=>{byId.set(158+i,key);byId.set(465+i,key)});
export function teamFor(id){return TEAMS[byId.get(Number.isInteger(id)?id:-1)]||TEAMS.unknown}

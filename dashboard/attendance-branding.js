// Manufacturer fallbacks for full ACC/LMU car names, not just short brand labels.
const brands = [
 ['aston martin','aston-martin.png'],['lamborghini','factory/lamborghini.png'],
 ['mercedes','mercedes.png'],['mclaren','mclaren.png'],['porsche','porsche.png'],
 ['ferrari','ferrari.png'],['ferari','ferrari.png'],['honda','honda.png?v=user-logo1'],
 ['lexus','lexus.svg'],['nissan','nissan.svg'],['ford','ford.svg'],
 ['chevrolet','chevrolet.svg'],['corvette','chevrolet.svg'],['bmw','bmw.png'],
 ['audi','audi.png'],['alpine','alpine.png'],['cadillac','cadillac.png'],
 ['toyota','factory/toyota.png'],['peugeot','factory/peugeot.png'],['genesis','factory/genesis.png'],
 ['red bull','red-bull.png'],['racing bulls','racing-bulls.png'],['williams','williams.png'],['haas','haas.png']
];
export function attendanceLogo(team) {
 const name=String(team.manufacturer||team.name||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/^(Hypercar|LMGT3|GT3)\s*[·:–-]\s*/i,'').trim().toLowerCase();
 const brand=brands.find(([key])=>name===key||name.startsWith(key+' ')||name.startsWith(key+'-'));
 if(brand)return 'assets/teams/'+brand[1];
 const explicit=String(team.logo||'');
 if(/^[a-z0-9][a-z0-9_./-]*$/i.test(explicit)&&!explicit.includes('..'))return 'assets/teams/'+explicit+(/\.(png|svg|webp)$/i.test(explicit)?'':'.png');
 return null;
}

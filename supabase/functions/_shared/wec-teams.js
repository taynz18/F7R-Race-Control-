// WEC uses a different role for each manufacturer and class, even where brands overlap.
export function wecRoleTeams(roles, cars=[], savedEmojis={}, emojis=[]) {
 const normalize=value=>String(value||'').normalize('NFKC').replace(/\p{Cf}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const brands=['Alpine','Ferrari','Aston Martin','Cadillac','Toyota','Genesis','Porsche','Peugeot','BMW','Mercedes','Lexus','McLaren','Ford','Chevrolet','Lamborghini'];
 const rows=new Map();
 for(const role of roles){const match=/^(.+?) (hypercar|lmgt3|gt3) wec$/.exec(normalize(role.name));if(!match)continue;
 const manufacturer=match[1]==='corvette'?'Chevrolet':brands.find(b=>normalize(b)===match[1]);if(!manufacturer)continue;
 const className=match[2]==='hypercar'?'Hypercar':'LMGT3',name=className+' · '+manufacturer;
 if(!rows.has(name))rows.set(name,{name,manufacturer,ids:[]});rows.get(name).ids.push(role.id);
 const configured=cars.find(car=>car.roleId===role.id&&car.emojiId);
 const saved=Object.keys(savedEmojis).find(label=>normalize(label).replace(/^(hypercar|lmgt3|gt3) /,'').replace(/ (hypercar|lmgt3|gt3)( wec)?$/,'').replace(/ (wec|lmu)$/,'')===normalize(manufacturer)&&savedEmojis[label]);
 const suggested=emojis.find(e=>normalize(e.name).replaceAll(' ','')===normalize(manufacturer).replaceAll(' ',''));
 const emoji=configured?.emojiId||savedEmojis[name]||(saved&&savedEmojis[saved])||suggested?.id;
 if(emoji)savedEmojis[name]=emoji;
 }
 return [...rows.values()].sort((a,b)=>a.name.localeCompare(b.name));
}


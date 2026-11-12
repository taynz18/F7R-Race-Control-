const wrap=(ctx,text,x,y,width,lineHeight,maxLines=4)=>{const words=String(text).split(/\s+/);let line='',count=0;for(const word of words){if(line&&ctx.measureText(line+' '+word).width>width){ctx.fillText(line,x,y);y+=lineHeight;if(++count>=maxLines)return y;line=word;}else line+=(line?' ':'')+word;}if(line){ctx.fillText(line,x,y);y+=lineHeight;}return y;};
const loadImage=src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>resolve(null);i.src=src;});
export async function commentaryImage({title,subtitle,briefing,map,facts,teamFor,lapTime}){
 const width=2400,gap=20,margin=55,col=(width-margin*2-gap*4)/5,row=265,top=270;
 const rows=4+Math.ceil(Math.max(0,briefing.cards.length-8)/5),height=top+rows*(row+gap)+130;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
 const bg=ctx.createLinearGradient(0,0,width,height);bg.addColorStop(0,'#1b3540');bg.addColorStop(.6,'#101b2a');bg.addColorStop(1,'#24263d');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
 ctx.strokeStyle='#b1e1d409';for(let x=-height;x<width;x+=35){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+height,height);ctx.stroke();}
 const box=(x,y,w,h,stroke='#aec8d36b',fill='#132332')=>{ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,w,h,16);ctx.fill();ctx.stroke();};
 const text=(s,x,y,font='20px Arial',color='#d7e8ed',max)=>{ctx.font=font;ctx.fillStyle=color;ctx.fillText(s,x,y,max);};
 const logo=await loadImage('./assets/f7r-logo.png');if(logo)ctx.drawImage(logo,width-300,65,240,62);
 text('F7R  /  COMMENTARY BRIEFING',margin,70,'bold 20px Arial','#a5ead9');text(title,margin,145,'bold 65px Arial','#fff',1900);text(subtitle,margin,193,'24px Arial','#c0d4df',2250);
 text(`${briefing.raceCount} recorded races · ${briefing.scopeCount} seasons · ${briefing.cards.length} drivers · F7R archived data`,margin,235,'20px Arial','#97c6c6');
 const cx=margin+col+gap,cy=top,cw=col*3+gap*2,ch=row*4+gap*3;box(cx,cy,cw,ch,'#a1dbce99','#0d1d29');
 text(map?.name||title,cx+30,cy+55,'bold 30px Arial','#e3fff6',cw-60);
 if(map?.path){ctx.save();const size=470;ctx.translate(cx+(cw-size)/2,cy+70);ctx.scale(size/600,size/600);const path=new Path2D(map.path);ctx.strokeStyle='#245655';ctx.lineWidth=17;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(path);ctx.strokeStyle='#b1ffeb';ctx.lineWidth=4;ctx.stroke(path);ctx.restore();}
 else text('Circuit outline unavailable',cx+40,cy+260,'25px Arial','#9eb7c8');
 text('Illustrative outline · game layouts may differ',cx+30,cy+545,'16px Arial','#93acb9');
 if(facts)text([facts.length,facts.turns&&facts.turns+' turns',facts.first&&'First F1 GP '+facts.first].filter(Boolean).join('  /  '),cx+30,cy+583,'bold 23px Arial','#bcece0',cw-60);
 let ty=cy+635;for(const t of briefing.talk.slice(0,3)){text(t.title.toUpperCase(),cx+30,ty,'bold 17px Arial','#8fdec9');ctx.font='22px Arial';ctx.fillStyle='#e0edf2';ty=wrap(ctx,t.text,cx+30,ty+30,cw-60,29,2)+18;}
 if(facts?.notes?.length&&ty<cy+ch-70){text('REAL-WORLD NOTE',cx+30,ty,'bold 16px Arial','#e9d79d');ctx.font='18px Arial';ctx.fillStyle='#cbdae0';wrap(ctx,facts.notes[0].text,cx+30,ty+28,cw-60,24,2);}
 const logos=await Promise.all(briefing.cards.map(c=>{const t=teamFor(c.teamName,c.teamInfo);return t?.logo?loadImage('./assets/teams/'+t.logo):null;}));
 briefing.cards.forEach((c,i)=>{const column=i<8?(i%2?4:0):(i-8)%5,r=i<8?Math.floor(i/2):4+Math.floor((i-8)/5),x=margin+column*(col+gap),y=top+r*(row+gap),t=teamFor(c.teamName,c.teamInfo),color=t?.color||'#93c5df';box(x,y,col,row,color+'99','#172634');ctx.fillStyle=color;ctx.fillRect(x+1,y+15,4,row-30);if(logos[i])ctx.drawImage(logos[i],x+18,y+18,43,34);text((c.champion?'★ ':'')+c.name,x+72,y+43,'bold 23px Arial','#fff',col-90);text(c.teamName||c.className||'Driver',x+18,y+78,'18px Arial',color,col-36);text(`P${c.position||'—'} · ${c.points} pts · ${c.seasonWins??'—'} season wins`,x+18,y+108,'18px Arial','#c9dce7',col-36);text(`${c.starts} venue starts  /  ${c.wins} wins  /  ${c.podiums} podiums`,x+18,y+145,'bold 18px Arial','#f1fafc',col-36);text(`Best finish: ${c.best?'P'+c.best:'—'} · Poles: ${c.poles}`,x+18,y+176,'17px Arial','#bcd5df',col-36);text(`Archived best lap: ${c.fastest?lapTime(c.fastest):'—'}`,x+18,y+202,'17px Arial','#bcd5df',col-36);text('Form: '+(c.form.map(f=>/dnf|retir|dsq|dns/i.test(f.status||'')?f.status:'P'+f.position).join(' / ')||'No completed races'),x+18,y+235,'17px Arial','#c5ecd8',col-36);});
 text('Source: F7R / RLT completed sessions. Missing data stays unavailable; aliases remain separate. Mixed layouts and game versions may affect lap comparisons.',margin,height-76,'17px Arial','#a3bfc9',2290);
 text('racecontrol.f7r.co.uk/commentary.html · Generated '+new Date().toLocaleString()+' · Real-world sources in the online briefing. Circuit data © Tomislav Bacinger / MIT.',margin,height-42,'16px Arial','#8fb0bd',2290);
 return canvas;
}

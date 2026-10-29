export const FLAG_LABELS={CLEAR:'Clear flags',YELLOW:'Yellow','SAFETY CAR':'Safety car',FCY:'Full course yellow','PREPARE TO RACE':'Prepare to race',RED:'Red',GREEN:'Green',BLUE:'Blue',WHITE:'White',BLACK:'Black',CHEQUERED:'Chequered'};
export const FLAG_COLORS={CLEAR:'#8b96ab',YELLOW:'#ffd84d','SAFETY CAR':'#ffd84d',FCY:'#ffd84d','PREPARE TO RACE':'#ffd84d',RED:'#ff5267',GREEN:'#70deac',BLUE:'#6baaff',WHITE:'#f5f5ef',BLACK:'#9aa4b5',CHEQUERED:'#f5f5ef'};
export function flagTimer(state,now){
 if(!state||state.flag==='CLEAR')return {label:'NO FLAG ACTIVE',value:'—'};
 const end=['FCY','PREPARE TO RACE'].includes(state.flag)&&state.countdown_ends_at?Date.parse(state.countdown_ends_at):null;
 const sec=Math.max(0,end?Math.ceil((end-now)/1000):Math.floor((now-Date.parse(state.updated_at))/1000));
 if(!Number.isFinite(sec))return {label:'TIME UNAVAILABLE',value:'—'};
 return {label:end?(state.flag==='FCY'?(sec===0?'ACTIVATING FCY':'FCY ACTIVE IN'):(sec===0?'AWAITING GREEN':'GREEN IN')):'LIVE FOR',value:[Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(n=>String(n).padStart(2,'0')).join(':')};
}
export class FlagController{
 constructor({client,isAdmin=false,userId=null,onChange=()=>{},onMessage=()=>{},now=()=>Date.now()}){
   Object.assign(this,{client,isAdmin,userId,onChange,onMessage,now});this.state=null;this.lastContact=null;this.offset=0;this.busy=false;this.active=false;this.channel=null;this.refreshing=false;this.accessChecked=0;
 }
 get online(){return this.lastContact!==null&&this.now()-this.lastContact<12000}
 emit(){this.onChange({state:this.state,isAdmin:this.isAdmin,busy:this.busy,online:this.online,timer:flagTimer(this.state,this.now()+this.offset)})}
 apply(next){
   if(!next||!(next.flag in FLAG_LABELS)||!Number.isSafeInteger(Number(next.revision)))return;
   if(this.state&&Number(next.revision)<Number(this.state.revision))return;
   if(next.server_time&&Number.isFinite(Date.parse(next.server_time)))this.offset=Date.parse(next.server_time)-this.now();
   this.state=next;this.lastContact=this.now();this.emit();
 }
 async refresh(){
   if(!this.active||this.refreshing)return;this.refreshing=true;
   try{
     // Recheck rights periodically; the server also checks every write.
     if(this.isAdmin&&this.now()-this.accessChecked>10000){
       await this.verifyAdmin();if(!this.active)return;
     }
     const {data,error}=await this.client.rpc('get_race_state');if(!this.active)return;
     if(error)throw error;this.apply(data);
   }catch{if(this.active)this.onMessage('Flag connection interrupted. Controls are disabled when the feed is stale.')}
   finally{this.refreshing=false;if(this.active)this.emit()}
 }
 async start(){
   this.active=true;
   this.channel=this.client.channel('f7r-shared-flags').on('postgres_changes',{event:'UPDATE',schema:'public',table:'flag_state',filter:'id=eq.1'},p=>{if(this.active)this.apply(p.new)}).subscribe(s=>{if(this.active&&s==='SUBSCRIBED')this.refresh()});
   this.poll=setInterval(()=>this.refresh(),5000);this.tick=setInterval(()=>this.emit(),1000);await this.refresh();
 }
 async stop(){this.active=false;clearInterval(this.poll);clearInterval(this.tick);const old=this.channel;this.channel=null;if(old)await this.client.removeChannel(old);this.state=null;this.isAdmin=false;this.emit()}
 async verifyAdmin(){
   if(!this.isAdmin||!this.userId){this.isAdmin=false;this.emit();return false}
   const {data,error}=await this.client.from('flag_admins').select('user_id').eq('user_id',this.userId).maybeSingle();
   if(!this.active)return false;
   this.isAdmin=!error&&!!data;this.accessChecked=this.now();this.emit();return this.isAdmin;
 }
 async write(name,body){
   if(!this.active||this.busy||!this.isAdmin||!this.online||!this.state)return false;
   this.busy=true;this.emit();
   try{
     if(!await this.verifyAdmin())throw Error('Your account is no longer approved to send flags.');
     const {data,error}=await this.client.rpc(name,body);
     if(!this.active)return false;if(error)throw error;this.apply(Array.isArray(data)?data[0]:data);this.onMessage('Saved. Connected drivers will receive the update.');return true;
   }catch(e){if(this.active){this.onMessage('Could not confirm the change. '+e.message);await this.refresh()}return false}
   finally{this.busy=false;if(this.active)this.emit()}
 }
 async send(flag,message='',seconds=null){
   if(!(flag in FLAG_LABELS)||typeof message!=='string'||message.length>120){this.onMessage('Choose a valid flag and a message up to 120 characters.');return false}
   if(seconds!==null&&(!['FCY','PREPARE TO RACE'].includes(flag)||!Number.isSafeInteger(seconds)||seconds<1||seconds>2147483647)){this.onMessage('Enter a whole number of seconds from 1 to 2147483647.');return false}
   return this.write('set_race_signal',{requested_flag:flag,requested_message:flag==='CLEAR'?'':message.trim(),countdown_seconds:seconds,expected_revision:this.state?.revision??null});
 }
 async updateMessage(message,expectedRevision){
   if(typeof message!=='string'||message.length>120||this.state?.flag==='CLEAR')return false;
   return this.write('update_flag_message',{requested_message:message.trim(),expected_revision:expectedRevision});
 }
 async cancelCountdown(){
   if(!['FCY','PREPARE TO RACE'].includes(this.state?.flag)||!this.state.countdown_ends_at)return false;
   return this.send(this.state.flag,this.state.custom_message||'',null);
 }
}



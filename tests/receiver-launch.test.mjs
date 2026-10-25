import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {readHiddenPassword} from '../receiver/launch.mjs';
function terminal(){
 const input=new PassThrough();input.isTTY=true;input.isRaw=false;input.setRawMode=value=>{input.isRaw=value};
 let text='';const output={write(value){text+=value}};
 return {input,output,get text(){return text}};
}
test('receiver password is hidden, supports backspace, and restores terminal',async()=>{
 const t=terminal(),result=readHiddenPassword(t.input,t.output);
 t.input.emit('keypress','s',{name:'s'});t.input.emit('keypress','x',{name:'x'});
 t.input.emit('keypress','',{name:'backspace'});t.input.emit('keypress','ecret',{});
 t.input.emit('keypress','\r',{name:'return'});
 assert.equal(await result,'secret');assert.equal(t.input.isRaw,false);
 assert.equal(t.text,'Receiver password (hidden): \n');
});
test('cancelled receiver sign-in clears raw mode without exposing password',async()=>{
 const t=terminal(),result=readHiddenPassword(t.input,t.output);
 t.input.emit('keypress','secret',{});t.input.emit('keypress','',{ctrl:true,name:'c'});
 await assert.rejects(result,/cancelled/);assert.equal(t.input.isRaw,false);assert.ok(!t.text.includes('secret'));
});
test('redirected input cannot collect a visible receiver password',async()=>{
 await assert.rejects(readHiddenPassword({isTTY:false},{}),/normal terminal/);
});

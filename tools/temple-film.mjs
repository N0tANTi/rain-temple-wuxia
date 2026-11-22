import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { soundscape, MUSIC_GAIN, AMBIENCE_GAIN } from '../src/temple-sound.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=await preview({root,configFile:join(root,'vite.config.mjs'),preview:{host:'127.0.0.1',port:0}});
const url=server.resolvedUrls.local[0];
const executable=[process.env.CHROME,...[process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA].filter(Boolean).flatMap(p=>[join(p,'Google/Chrome/Application/chrome.exe'),join(p,'Microsoft/Edge/Application/msedge.exe')])].find(p=>p&&existsSync(p));
const browser=await chromium.launch({executablePath:executable,headless:true,args:['--enable-gpu','--use-angle=d3d11','--ignore-gpu-blocklist','--mute-audio']});
const proof=process.argv.includes('--proof'), rate=30,seconds=20, width=proof?960:1920;
const work=await mkdtemp(join(tmpdir(),'rain-temple-'));console.log('Frames:',work);
let encoder;
try{
  const page=await browser.newPage({viewport:{width,height:width*9/16},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text().slice(0,2500));}});
  await page.goto(url+'?capture');
  await page.waitForFunction(()=>window.temple,null,{timeout:90000});
  if(errors.length)throw Error(errors.join('\n'));
  if(!proof){
    encoder=spawn('ffmpeg',['-y','-v','error','-f','image2pipe','-framerate',String(rate),'-c:v','mjpeg','-i','pipe:0','-vf','scale=out_color_matrix=bt709:out_range=tv,format=yuv420p','-c:v','libx264','-preset','fast','-crf','17','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',join(work,'video.mp4')],{stdio:['pipe','ignore','inherit'],windowsHide:true});
  }
  const closed=encoder&&once(encoder,'close');
  const indices=proof?[0,90,138,159,200,302,373,453,599]:Array.from({length:seconds*rate},(_,i)=>i);
  for(const i of indices){
    const data=await page.evaluate(t=>{window.temple.frame(t);return window.temple.renderer.domElement.toDataURL('image/jpeg',.95).split(',')[1];},i/rate);
    const frame=Buffer.from(data,'base64');
    if(proof)await writeFile(join(work,'frame-'+String(i).padStart(3,'0')+'.jpg'),frame);
    else if(!encoder.stdin.write(frame))await once(encoder.stdin,'drain');
    if(i%120===0)console.log('Frame',i);
  }
  if(errors.length)throw Error(errors.join('\n'));
  if(!proof){
    encoder.stdin.end();if((await closed)[0]!==0)throw Error('Video encoding failed');
    await page.addScriptTag({content:'window.score = '+soundscape.toString()});
    const audio=await page.evaluate(async secs=>{
      const hz=48000,ctx=new OfflineAudioContext(1,secs*hz,hz),master=ctx.createGain();
      master.connect(ctx.destination);master.gain.setValueAtTime(1,secs-1.15);master.gain.linearRampToValueAtTime(0,secs);
      window.score(ctx,master).flow(4.625);
      const samples=(await ctx.startRendering()).getChannelData(0),pcm=new Int16Array(samples.length);
      for(let i=0;i<pcm.length;i++)pcm[i]=Math.round(32767*Math.max(-1,Math.min(1,samples[i])));
      const bytes=new Uint8Array(pcm.buffer);let str='';for(let i=0;i<bytes.length;i+=16384)str+=String.fromCharCode(...bytes.subarray(i,i+16384));
      return btoa(str);
    },seconds);
    await writeFile(join(work,'audio.pcm'),Buffer.from(audio,'base64'));
    const dest=resolve(root,'../雨过山寺.mp4');
    const mix='[1:a]volume='+AMBIENCE_GAIN+',pan=stereo|c0=c0|c1=c0[fx];[2:a]volume='+MUSIC_GAIN+'[music];[fx][music]amix=inputs=2:normalize=0:duration=first,atrim=duration='+seconds+'[out]';
    const mux=spawnSync('ffmpeg',['-y','-v','error','-i',join(work,'video.mp4'),'-f','s16le','-ar','48000','-ac','1','-i',join(work,'audio.pcm'),'-i',join(root,'public/audio/过桥听雨.m4a'),'-filter_complex',mix,'-map','0:v:0','-map','[out]','-c:v','copy','-c:a','aac','-b:a','256k','-movflags','+faststart',dest],{stdio:'inherit',windowsHide:true});
    if(mux.status!==0)throw Error('Sound mux failed');
    console.log(dest);
  }else{
    await page.goto(url);await page.waitForFunction(()=>window.temple);
    await page.getByRole('button',{name:'拨动竹槽 · E'}).click();
    await page.waitForFunction(()=>window.temple.state.phase==='flow');
    await page.keyboard.press('r');await page.waitForFunction(()=>window.temple.state.opened===null);
    await page.getByRole('button',{name:'观看短片'}).click();await page.waitForFunction(()=>window.temple.state.phase==='done',null,{timeout:60000});
    await page.setViewportSize({width:411,height:750});await page.getByRole('button',{name:'重新引水 · R'}).click();
    await page.waitForFunction(()=>window.temple.state.phase==='idle');if(errors.length)throw Error(errors.join('\n'));
    console.log('Verified live sluice, reset, playback and narrow layout.');
  }
}finally{
  if(encoder&&encoder.exitCode===null)encoder.kill();
  await browser.close();await server.close();
}

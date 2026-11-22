import * as T from 'three';
import {createWash} from './wash.js';
import {createPage} from './page.js';
import {createWayfarer} from './wayfarer.js';
import {buildTemple} from './temple.js';
import {mountains,makeWater} from './temple-weather.js';
import {soundscape, MUSIC_GAIN, AMBIENCE_GAIN} from './temple-sound.js';

const capture=new URLSearchParams(location.search).has('capture');
const V=(x,y,z)=>new T.Vector3(x,y,z);
const ease=(a,b,t)=>T.MathUtils.smoothstep(t,a,b);
const host=document.querySelector('#view'), openButton=document.querySelector('#sluice');
const repeat=document.querySelector('#again'),hint=document.querySelector('#hint'),watch=document.querySelector('#watch');
if(capture) document.body.classList.add('capture');

async function start(){
  const renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:capture});
  renderer.autoClear=false;renderer.setPixelRatio(capture?1:Math.min(devicePixelRatio,1.25));renderer.setSize(innerWidth,innerHeight);
  host.appendChild(renderer.domElement);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(44,innerWidth/innerHeight,.09,450);
  const light=new T.DirectionalLight('#fff7e6',3.5);light.position.set(-12,19,13);
  scene.add(light,new T.HemisphereLight('#f6f3eb','#b5a5a5',.95),new T.AmbientLight('#fff5e3',.42));
  const wash=createWash({x0:-32,z0:-35,size:68,cells:384});
  const page=createPage(renderer);page.wet.value=.76;
  const sky=mountains(scene),temple=buildTemple(scene,wash),water=makeWater(scene,wash,temple);
  const doll=await createWayfarer(wash.alwaysBoth);
  scene.add(doll.group);
  const mixer=new T.AnimationMixer(doll.man.object);
  mixer.clipAction(doll.man.clips.Idle).play();
  const body=doll.man.object;
  body.position.set(.32,.09,8.08);body.rotation.y=2.18;
  const spine=doll.man.bones.spine_02, arm=doll.man.bones.upperarm_r;
  let time=0,opened=null,auto=false,previous=performance.now(),phase='',angle=0,lift=0,zoom=1,grip=null,sound=null,ctx=null;
  let musicAsset,musicBuffer,musicVoice,ambienceBus;
  const ray=new T.Raycaster();
  function resize(){
    renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();page.resize();
    wash.px.value=4.5*renderer.getDrawingBufferSize(new T.Vector2()).y/1080;
  }
  function seedPaint(){
    wash.paint.none();
    wash.paint.touch(-28,-28,-100,.9,7); // Pigment for the permanently mossy cliff pines.
    wash.paint.touch(temple.basinX,temple.startZ+.48,2.15,.69,1.3);
    wash.paint.sync();
  }
  function openSluice(){
    if(opened!==null)return;
    opened=time;
    const {basinX:x,startZ:z,endZ:end}=temple;
    // Each cross-section gets an arrival time. The original wash shader then bleeds
    // sideways into the deck and climbs the wood from its foot.
    for(let k=0;k<=72;k++){
      const p=k/72;
      wash.paint.touch(x,T.MathUtils.lerp(z,end,p),time+1.05+p*6.55,2.55,2.15);
    }
    for(let i=0;i<=10;i++)wash.paint.touch(x+i*.2,end,time+7.7+i*.07,1.1,2.3);
    for(const [x,z,delay,reach] of [[.7,-8,7.7,3.2],[0,-11,8.4,3.7],[0,-14,9,4.8],[0,-17.2,9.8,5.8],[-4.5,-18,10.3,3.4]])wash.paint.touch(x,z,time+delay,reach,2.2);
    wash.paint.sync();
    if(sound)sound.flow(ctx.currentTime+.025);
    if(!auto)playMusic(4.6);
  }
  function reset(film=false){
    time=0;opened=null;auto=film;angle=0;lift=0;zoom=1;phase='';
    seedPaint();
    if(musicVoice){musicVoice.stop();musicVoice=null;}
    if(sound){sound.stop();sound=soundscape(ctx,ambienceBus);}
    if(film)playMusic(0);
  }
  function playMusic(offset) {
    if(!ctx||!musicBuffer)return;
    const voice=ctx.createBufferSource(),gain=ctx.createGain(),when=ctx.currentTime+.025;
    gain.gain.setValueAtTime(offset?0:MUSIC_GAIN,when);
    gain.gain.linearRampToValueAtTime(MUSIC_GAIN,when+.12);
    voice.buffer=musicBuffer;voice.connect(gain).connect(ctx.destination);
    voice.onended=()=>{voice.disconnect();gain.disconnect();if(musicVoice===voice)musicVoice=null;};
    voice.start(when,offset);musicVoice=voice;
  }
  async function audio(){
    ctx??=new AudioContext();await ctx.resume();
    if(!ambienceBus){ambienceBus=ctx.createGain();ambienceBus.gain.value=AMBIENCE_GAIN;ambienceBus.connect(ctx.destination);}
    sound??=soundscape(ctx,ambienceBus,time);
    musicAsset??=fetch(globalThis.templeAssets?.score??'./audio/过桥听雨.m4a')
      .then(r=>{if(!r.ok)throw Error('Music unavailable');return r.arrayBuffer();})
      .then(bytes=>ctx.decodeAudioData(bytes));
    musicBuffer=await musicAsset;
  }
  function status(flow){
    const next=opened===null?'idle':flow<9?'flow':'done';
    if(next===phase)return;phase=next;
    hint.textContent=next==='idle'?'拨动竹槽，把檐水引上廊桥。':next==='flow'?'水正在沿石槽流向对岸。':'水已抵达山寺。';
    openButton.hidden=next!=='idle'||auto;watch.hidden=auto||next!=='idle';repeat.hidden=next==='idle'&&!auto;
  }
  function frame(t){
    time=t;
    if(auto&&opened===null&&time>=4.6)openSluice();
    const f=opened===null?-20:time-opened;
    wash.uniforms.uNow.value=time;
    const turning=ease(.05,1.2,f);
    temple.spout.rotation.set(-.16-.13*turning,1.04*(1-turning),0,'YXZ');
    temple.chime.rotation.z=f<10.75?0:.23*Math.exp(-(f-10.75)*.9)*Math.sin((f-10.75)*7.6);
    water(time,f);
    const lean=ease(-.03,.53,f)*(1-ease(1.0,1.85,f));
    mixer.setTime(time*.77);spine.rotation.x+=.38*lean;arm.rotation.x-=.1*lean;
    body.updateMatrixWorld(true);
    doll.reach(V(.88,.83,7.82),lean);
    let eye,look,fov;
    if(f<.95){
      const k=auto?ease(0,5.5,time):.55+.2*Math.sin(time*.3);
      eye=V(3.18-.22*k,1.58+.14*k,9.53-.22*k);look=V(.70,1.10-.07*k,7.78-.22*k);fov=49;
    }else if(f<7.6){
      const k=T.MathUtils.clamp((f-.95)/6.65,0,1), head=T.MathUtils.lerp(6.9,-6.0,k);
      eye=V(-1.13+.20*k,1.51+.31*k,head+2.16);
      look=V(1.08,.44+.29*k,head-.29);fov=56;
    }else{
      const k=ease(7.6,15.4,f);
      eye=V(12.6+10.9*k,2.9+3.75*k,1.15+12.2*k);look=V(.6,.5+1.28*k,-7.5-.35*k);fov=49;
    }
    const delta=eye.sub(look).applyAxisAngle(V(0,1,0),angle).multiplyScalar(zoom);
    delta.y+=lift;camera.position.copy(look).add(delta);camera.lookAt(look);camera.fov=fov;camera.updateProjectionMatrix();camera.updateMatrixWorld();
    sky.position.copy(camera.position);page.render(scene,camera);
    status(f);
  }
  function enableAudio(){
    return audio().catch(()=>{}); // Audio may be unavailable while graphics remain interactive.
  }
  function interact(){if(opened!==null)return;void enableAudio().then(()=>{openSluice();status(0);});}
  openButton.onclick=interact;
  repeat.onclick=()=>reset();
  watch.onclick=()=>{void enableAudio().then(()=>reset(true));};
  addEventListener('keydown',e=>{
    if(e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.code==='KeyE'&&opened===null)interact();
    if(e.code==='KeyR')reset();
  });
  host.onpointerdown=e=>{host.setPointerCapture(e.pointerId);grip={x:e.clientX,y:e.clientY,motion:0};};
  host.onpointerup=e=>{
    if(grip&&grip.motion<6&&opened===null){
      ray.setFromCamera(new T.Vector2(2*e.clientX/innerWidth-1,1-2*e.clientY/innerHeight),camera);
      if(ray.intersectObject(temple.spout,false).length)interact();
    }
    grip=null;
  };
  host.onpointercancel=()=>grip=null;
  host.onpointermove=e=>{
    if(!grip)return;
    const dx=e.clientX-grip.x,dy=e.clientY-grip.y;
    grip.motion+=Math.hypot(dx,dy);angle-=.005*dx;lift=T.MathUtils.clamp(lift+.014*dy,-1,4);grip.x=e.clientX;grip.y=e.clientY;
  };
  host.addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(.001*e.deltaY),.66,1.65);},{passive:false});
  addEventListener('resize',resize);
  reset(capture);resize();frame(0);document.querySelector('#loading').hidden=true;
  const loop=now=>{frame(time+Math.min(.085,(now-previous)/1000));previous=now;requestAnimationFrame(loop);};
  if(!capture)requestAnimationFrame(loop);
  window.temple={frame,reset,openSluice,renderer, get state(){return {time,opened,phase,arrival:wash.paint.at(1,-8)};}};
}
start().catch(e=>{console.error(e);document.querySelector('#loading').textContent='场景加载失败，请使用支持 WebGL 2 的浏览器刷新重试。';});

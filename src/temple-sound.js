export const MUSIC_GAIN=.45;
export const AMBIENCE_GAIN=1.35;

// Diegetic sound, scheduled against either the interactive or the export clock.
export function soundscape(ctx,destination,offset=0) {
  const bus=ctx.createGain();bus.gain.value=.58;bus.connect(destination);
  const t0=ctx.currentTime+.025;
  const buffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);
  const samples=buffer.getChannelData(0);let seed=34712,prev=0;
  for(let i=0;i<samples.length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    prev=prev*.55+.45*(seed/2147483648-1);samples[i]=prev;
  }
  const bed=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),level=ctx.createGain();
  bed.buffer=buffer;bed.loop=true;filter.type='bandpass';filter.frequency.value=2000;filter.Q.value=.38;
  level.gain.value=.085;bed.connect(filter).connect(level).connect(bus);bed.start(t0);
  function tone(t,freq,gain,decay,pitch=1){
    const osc=ctx.createOscillator(),v=ctx.createGain();osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(freq*pitch,t+decay);
    v.gain.setValueAtTime(.00001,t);v.gain.exponentialRampToValueAtTime(gain,t+.009);v.gain.exponentialRampToValueAtTime(.00001,t+decay);
    osc.connect(v).connect(bus);osc.start(t);osc.stop(t+decay+.02);
  }
  function drip(t){tone(t,910,.105,.21,.51);tone(t+.022,1518,.026,.135,.76);}
  function flow(t){
    level.gain.setTargetAtTime(.21,t+1.2,2.4);
    for(let i=0;i<24;i++)drip(t+.4+i*.43+.13*Math.sin(i*3.8));
    const bell=t+10.75;
    for(const [f,g,d] of [[598,.19,3.8],[1207,.07,2.5],[1631,.045,2],[2487,.025,.95]])tone(bell,f,g,d);
  }
  const first=Math.ceil(offset/1.25)*1.25-offset;
  for(let t=first;t<=24;t+=1.25)drip(t0+t);
  return {flow,stop(){bus.gain.setTargetAtTime(.0001,ctx.currentTime,.035);bed.stop(ctx.currentTime+.2);}};
}

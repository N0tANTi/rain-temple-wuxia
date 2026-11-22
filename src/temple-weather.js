import * as T from 'three';
import { createBatch } from './wash.js';
import { fieldBy } from './pencil.js';
import { rng } from './noise.js';

const V=(x,y,z)=>new T.Vector3(x,y,z);
const clamp=T.MathUtils.clamp;

export function mountains(scene) {
  // Layered wet washes fade into the cloud sea as the eye follows the bridge.
  const material=new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,
    vertexShader:'varying vec3 ray;void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`
      varying vec3 ray;
      float h(float x){return fract(sin(x*127.1)*43758.5453);}
      float n(float x){float f=fract(x);return mix(h(floor(x)),h(floor(x)+1.),smoothstep(0.,1.,f));}
      void main(){
        vec3 d=normalize(ray);float a=atan(d.z,d.x),v=d.y;
        vec3 paper=vec3(.973,.982,.974), c=mix(paper,vec3(.79,.854,.877),smoothstep(-.02,.66,v)*.62);
        for(int i=0;i<6;i++){
          float k=float(i),x=a*(2.7+.27*k)+k*17.39;
          float mass=n(x*1.6)*.62+n(x*3.7)*.27+n(x*8.2)*.1+n(x*20.)*.04;
          float crest=.17-.071*k+(mass-.45)*(.34+.023*k)+.005*n(x*47.);
          float below=crest-v, ridge=smoothstep(-.003,.005,below);
          vec3 pigment=mix(vec3(.69,.79,.84),vec3(.36,.52,.53),k/6.);
          float crag=.5+.5*sin(x*29.+v*24.+5.*n(x*11.+v*1.3));
          pigment+=.045*crag+.037*n(x*40.+v*7.);
          float fade=exp(-max(0.,below)*(10.-.65*k));
          c=mix(c,mix(paper,pigment,fade*(.68+.25*n(x*5.))),ridge);
        }
        gl_FragColor=vec4(c,.05);
      }`});
  const sky=new T.Mesh(new T.SphereGeometry(280,80,24),material);
  sky.renderOrder=-10;scene.add(sky);return sky;
}

export function makeWater(scene,wash,temple) {
  const {basinX:x,startZ:z,endZ:end}=temple;
  const channel=createBatch(wash.water);
  const waterStrip=(cx,cy,cz,w,d)=>{
    const g=new T.PlaneGeometry(w,d,5,Math.max(3,Math.round(d*4))).rotateX(-Math.PI/2).translate(cx,cy,cz);
    fieldBy(g,(xx,yy,zz)=>[-zz*2,(xx-cx)*3]);
    channel.add(g,'#367f7d');
  };
  const reservoir=new T.CircleGeometry(.548,40).rotateX(-Math.PI/2).translate(x,.744,z+.48);
  fieldBy(reservoir,(xx,yy,zz)=>[-zz*2,(xx-x)*3]);channel.add(reservoir,'#397c80');
  waterStrip(x,.177,(z+end)/2,.4,z-end);
  waterStrip(2.03,.18,end,2.2,.34);
  const streams=channel.build();scene.add(streams);
  const moving=new T.Group();scene.add(moving);
  const glint=new T.MeshBasicMaterial({color:'#b2d9cd',side:T.DoubleSide});
  const pool=new T.Mesh(new T.RingGeometry(.14,.158,48).rotateX(-Math.PI/2),glint);
  pool.position.set(x,.754,z+.48);moving.add(pool);
  const feed=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([V(x,.86,z+.25),V(x,.60,z-.61),V(x,.44,z-.84),V(x,.17,z-1)]),16,.041,7,false),new T.MeshBasicMaterial({color:'#74b4ad'}));
  scene.add(feed);
  const drop=new T.Mesh(new T.SphereGeometry(.052,12,10),new T.MeshBasicMaterial({color:'#609a9f'}));moving.add(drop);
  const random=rng(905), falls=[];
  for(let i=0;i<27;i++){
    const len=1.1+random()*3.4,seed=random(),offset=random()*.31-.155;
    const geo=new T.PlaneGeometry(.018+random()*.036,len,1,8);
    const m=new T.Mesh(geo,new T.MeshBasicMaterial({color:i%4===0?'#719d9c':'#c4dcd4',side:T.DoubleSide,transparent:true,opacity:.42+random()*.32,depthWrite:false}));
    scene.add(m);falls.push({m,len,seed,offset});
  }
  const ribbon=new T.Mesh(new T.PlaneGeometry(.46,10,4,24),new T.MeshBasicMaterial({color:'#76aaa9',transparent:true,opacity:.71,side:T.DoubleSide,depthWrite:false}));
  scene.add(ribbon);ribbon.rotation.y=Math.PI/2;
  return (time,flow)=>{
    const phase=(time*.8)%1;
    drop.position.set(x,2.69-1.93*phase*phase,z+.48);drop.scale.set(.35,.4+.85*phase,.35);
    feed.visible=flow>.88;
    pool.scale.setScalar(.25+phase*1.9);
    const fall=clamp((flow-7.5)/2.2,0,1);
    ribbon.visible=fall>0;ribbon.scale.y=Math.max(.001,fall);ribbon.position.set(3.12,.12-5*fall,end);
    for(const {m,len,seed,offset} of falls){
      const progress=(time*.67+seed)%1,depth=progress*progress*10,visibleDepth=10*fall-depth;
      m.visible=visibleDepth>.03;
      if(m.visible){const size=Math.min(len,visibleDepth);m.scale.y=size/len;m.position.set(3.15+.1*Math.sin(seed*44)+depth*.024,.16-depth-size/2,end+offset);m.rotation.y=1.1+.35*Math.sin(seed*25);}
    }
  };
}

import * as T from 'three';
import { createBatch, createDabs } from './wash.js';
import { rng, noise } from './noise.js';

const V = (x,y,z) => new T.Vector3(x,y,z);
const TAU = 2 * Math.PI;
const random = rng(714);
const RED = '#ac462d', WOOD = '#765140', ROOF = '#4b666b', STONE = '#adb4ad';
const pick = list => list[Math.floor(random() * list.length)];
const brush = (geometry, colour, layer, at) => layer.add(geometry,colour,undefined,undefined,at);

function meshGeometry(vertices, indices) {
  const g = new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function bar(layer,a,b,radius,col,tip=radius,at=null,sides=8) {
  const dir = b.clone().sub(a);
  const g = new T.CylinderGeometry(tip,radius,dir.length(),sides);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(V(0,1,0),dir.normalize()));
  const p = a.clone().lerp(b,0.5);
  brush(g.translate(p.x,p.y,p.z),col,layer,at);
}
function slab(layer,x,y,z,w,h,d,col,at=null) {
  brush(new T.BoxGeometry(w,h,d).translate(x,y,z),col,layer,at);
}

// A hipped roof. Each sweep is generated from the ridge down to the four upturned corners.
function roof(layer,x,y,z,w,d,h) {
  const ridge = Math.max(0.32,d-w*0.68);
  const corners=[[-w,-d],[w,-d],[w,d],[-w,d]];
  const top=[[0,-ridge],[0,-ridge],[0,ridge],[0,ridge]];
  const root=[x,0,z,0.21];
  for(let face=0;face<4;face++) {
    const end=(face+1)%4, a=corners[face], b=corners[end];
    const sample=(u,v)=>{
      const rimX=T.MathUtils.lerp(a[0],b[0],u), rimZ=T.MathUtils.lerp(a[1],b[1],u);
      const innerX=T.MathUtils.lerp(top[face][0],top[end][0],u),innerZ=T.MathUtils.lerp(top[face][1],top[end][1],u);
      const lip=(0.12+0.8*Math.pow(Math.abs(u*2-1),4))*Math.min(h*0.52,0.64);
      return V(x+T.MathUtils.lerp(innerX,rimX,v),y+h*(1-v)**1.7+lip*v**2,z+T.MathUtils.lerp(innerZ,rimZ,v));
    };
    const nu=Math.max(12,Math.round(a[0]===b[0]?d*4:w*4)), nv=6, verts=[],idx=[];
    for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++) {
      const p=sample(i/nu,j/nv); verts.push(p.x,p.y,p.z);
      if(i&&j){const k=i*(nv+1)+j;idx.push(k,k-1,k-nv-2,k,k-nv-2,k-nv-1);}
    }
    const g=meshGeometry(verts,idx);
    brush(g,ROOF,layer,root);
    for(let i=0;i<=nu;i++){
      const u=i/nu,colour=pick(['#637c7d','#6c8280','#536d70','#536367']);
      let prev=sample(u,0.05);
      for(let j=1;j<=5;j++){const next=sample(u,0.05+0.95*j/5);bar(layer,prev,next,i===0?0.07:0.031,colour,undefined,root,5);prev=next;}
      if(i<nu)bar(layer,sample(u,1),sample((i+1)/nu,1),0.072,WOOD,undefined,root);
    }
  }
  bar(layer,V(x,y+h+0.075,z-ridge),V(x,y+h+0.075,z+ridge),0.1,'#5a6c69',undefined,root);
}

function post(layer,x,z,y,height) {
  const at=[x,y,z,0.3];
  slab(layer,x,y+0.11,z,0.4,0.22,0.4,'#91998b',at);
  bar(layer,V(x,y+0.18,z),V(x,y+height,z),0.152,RED,0.129,at,12);
  slab(layer,x,y+height-0.18,z,0.64,0.17,0.38,'#986849',at);
  slab(layer,x,y+height-0.035,z,0.94,0.13,0.48,'#97734d',at);
}
function templeHall(layer,x,y,z,w,d,h) {
  slab(layer,x,y-0.15,z,w+1,0.32,d+1,STONE);
  slab(layer,x,y+h*0.49,z,w*0.88,h*0.98,d*0.81,'#d7ba8a',[x,y,z,0.13]);
  for(const side of [-1,1]){
    for(let k=0;k<5;k++)post(layer,x+(k/4-0.5)*w,z+side*d/2,y,h);
    for(let k=0;k<12;k++){
      const wx=x+(k/11-0.5)*w*0.8;
      slab(layer,wx,y+h*0.54,z+side*d*0.415,0.055,h*0.7,0.055,WOOD);
    }
    for(const yy of [0.18,0.62,0.84])slab(layer,x,y+h*yy,z+side*d*0.418,w*0.82,0.065,0.074,WOOD);
    slab(layer,x,y+h-0.03,z+side*d/2,w+0.6,0.23,0.24,RED);
    for(let k=0;k<11;k++)slab(layer,x+side*w*.45,y+h*.55,z+(k/10-.5)*d*.75,.06,h*.66,.07,WOOD);
    for(const t of [.23,.54,.8])slab(layer,x+side*w*.45,y+h*t,z,.065,.06,d*.8,RED);
    for(const sz of [-.35,0,.35])post(layer,x+side*w/2,z+d*sz,y,h);
  }
  roof(layer,x,y+h,z,w*0.64,d*0.68,Math.min(2.3,w*0.28));
}

function cliff(layer,cx,cz,rx,rz) {
  const ring=48, levels=14, pos=[],idx=[], col=[], colour=new T.Color();
  const sides=Array.from({length:ring},(_,i)=>1+0.1*noise(i*0.53,cx+cz)+0.09*Math.sin(i*1.1));
  for(let j=0;j<=levels;j++)for(let i=0;i<ring;i++){
    const a=i/ring*TAU,t=j/levels,k=sides[i]*(1-0.24*t +0.15*Math.sin(Math.PI*t));
    const x=cx+Math.cos(a)*rx*k+0.7*Math.sin(t*4+a*3),z=cz+Math.sin(a)*rz*k;
    const y=-0.34-23*t+(t>0.05?0.54*noise(i*0.4,j*0.65):0);
    pos.push(x,y,z);
    const l=0.5+0.27*noise(i*0.63,j*0.28)+0.16*Math.sin(a*16+t*4);
    colour.set('#535f64').lerp(new T.Color('#c3c7b9'),T.MathUtils.clamp(l+t*0.38,0,1));
    if(j<2)colour.lerp(new T.Color('#738579'),0.4);
    col.push(colour.r,colour.g,colour.b);
    if(j<levels){const k0=j*ring+i,n=j*ring+(i+1)%ring;idx.push(k0,n,k0+ring,n,n+ring,k0+ring);}
  }
  for(let i=1;i<ring-1;i++)idx.push(0,i+1,i);
  const g=meshGeometry(pos,idx);g.setAttribute('color',new T.Float32BufferAttribute(col,3));brush(g,'#888888',layer);
}

function pine(layer,dabs,x,y,z,h) {
  const a=V(x,y,z), bend=V(x+h*0.17,y+h*0.53,z+h*0.04), tip=V(x+h*0.04,y+h*0.9,z);
  bar(layer,a,bend,h*0.046,'#6c6557',h*0.032);bar(layer,bend,tip,h*0.032,'#746955',0.035);
  for(let k=0;k<10;k++) {
    const t=k/10,angle=k*2.4+z,origin=bend.clone().lerp(tip,t);
    const width=h*(0.46-0.27*t),bud=origin.clone().add(V(Math.sin(angle)*width,h*0.12,Math.cos(angle)*width));
    bar(layer,origin,bud,h*0.022,'#716457',0.025);
    for(let i=0;i<65;i++){
      const ang=random()*TAU,r=Math.sqrt(random())*h*(0.23-0.07*t);
      const seed=random();dabs.add(bud.x+Math.cos(ang)*r,bud.y+random()*0.24+h*0.11*(1-r/(0.24*h)),bud.z+Math.sin(ang)*r,
        {w:h*(0.028+seed*0.037),h:h*0.041,kind:5,colour:pick(['#365953','#48695a','#697f62','#809472']),seed,line:seed>0.85,at:[-28,0,-28,0]});
    }
  }
}

export function buildTemple(scene,wash) {
  const stone=createBatch(wash.alwaysBoth),paint=createBatch(wash.both),rock=createBatch(wash.rock),needles=createDabs(wash.dab,wash.dabDepth);
  cliff(rock,0,13,7,6.9);cliff(rock,0,-17.8,8,8);
  for(const [cz,rx,rz] of [[13,7,6.9],[-17.8,8,8]]){
    for(let i=0;i<117;i++){
      const a=random()*TAU,s=.54+.4*random(),x=rx*s*Math.cos(a),z=cz+rz*s*Math.sin(a);
      if(Math.abs(x)<3.6)continue;
      const radius=.2+.62*random();
      const g=new T.IcosahedronGeometry(radius,0).scale(1.45,.6+random(),.9).rotateY(a).translate(x,-.24,z);
      brush(g,pick(['#8c978a','#939780','#718479','#acb1a3']),rock);
      for(let j=0;j<18;j++){
        const ox=x+(random()-.5)*.85,oz=z+(random()-.5)*.85;
        needles.add(ox,-.2+random()*.22,oz,{kind:1,w:.11,h:.21,colour:pick(['#667d57','#b1ac70','#617c67']),seed:random(),at:[-28,0,-28,0]});
      }
    }
    // Sparse cypresses and creeping branches break the sharp rim of the cliffs.
    for(let i=0;i<22;i++){
      const a=i/22*TAU,x=Math.cos(a)*rx*.98,z=cz+Math.sin(a)*rz*.98;
      if(Math.abs(x)<3)continue;
      const k=2+Math.floor(random()*5);let prev=V(x,-.28,z);
      for(let j=1;j<=k;j++){
        const next=V(x+.15*Math.sin(j+a),-.28-j*.39,z+.14*Math.cos(j+a));
        bar(stone,prev,next,.03,'#737358',.022);
        for(let l=0;l<8;l++)needles.add(next.x+(random()-.5)*.35,next.y+random()*.16,next.z+(random()-.5)*.35,{kind:5,w:.095,h:.075,seed:random(),colour:'#70805b',at:[-28,0,-28,0]});
        prev=next;
      }
    }
  }
  for(const [z,len,w] of [[12,8,8.8],[-16.5,12,10.2]])slab(paint,0,-0.2,z,w,0.4,len,'#babab0');
  slab(paint,0,-0.36,-1.6,4.5,0.65,22,'#a6a89a');
  for(let i=0;i<52;i++)slab(paint,0,-0.015,9-i*0.43,4.4,0.12,0.413,pick(['#aaa298','#b8b1a1','#a8a89c','#b7ae9c']));
  // Brackets beneath the span join the bridge to the two granite piers.
  for(const x of [-1.85,1.85]){
    for(const [a,b] of [[8,1],[-11,-4]])bar(stone,V(x,-5,a),V(x,-0.55,b),0.22,'#6a6e64',0.23);
    slab(paint,x,0.76,-1.2,0.11,0.13,20.7,RED);
    slab(paint,x,0.39,-1.2,0.09,0.08,20.7,WOOD);
    for(let i=0;i<17;i++)slab(paint,x,0.39,8.8-i*1.26,0.095,0.79,0.095,'#9a6046');
  }
  for(let i=0;i<6;i++){
    const z=5.9-i*3.25;
    for(const x of [-1.79,1.79])post(paint,x,z,0.04,2.83);
    slab(paint,0,2.78,z,4.25,0.21,0.28,RED);
    for(const side of [-1,1]){
      const x=side*1.79;
      for(const dir of [-1,1])bar(paint,V(x,2.09,z),V(x,2.75,z+dir*.65),.076,WOOD);
      if(i%2===0){
        const root=[x,0,z,.23], py=2.14;
        bar(paint,V(x*.76,2.83,z),V(x*.76,2.37,z),.018,WOOD,undefined,root);
        const lantern=new T.SphereGeometry(.22,12,9).scale(.82,1.12,.82).translate(x*.76,py,z);
        brush(lantern,'#c77149',paint,root);
        for(const dy of [-.22,.22])slab(paint,x*.76,py+dy,z,.21,.038,.2,'#806140',root);
        bar(paint,V(x*.76,py-.22,z),V(x*.76,py-.38,z),.018,RED,undefined,root);
      }
    }
  }
  for(const x of [-1.8,1.8])slab(paint,x,2.93,-2.2,0.21,0.25,18.5,WOOD);
  roof(paint,0,3.03,-2.2,2.68,9.5,1.16);
  for(let i=0;i<7;i++)slab(paint,0,0.11+i*0.16,-11.1-i*0.39,6,0.22+i*0.32,0.43,STONE);
  templeHall(paint,0,1.18,-16.7,6.7,6,2.6);
  templeHall(paint,0,5.02,-16.7,4.8,4.5,2.05);
  templeHall(paint,0,8.0,-16.7,3.1,3.1,1.5);
  bar(paint,V(0,10.3,-16.7),V(0,11.6,-16.7),0.12,'#82694a',0.015);
  templeHall(paint,-4.9,0.03,-17.2,2.8,3.8,1.9);
  for(const [x,z,h] of [[-4.7,9.8,4.9],[4,13.6,4.6],[-5.8,-11.8,4.3],[5,-14.3,4.2],[-5,-20,6],[4,-21.8,5.2],[3.3,16.1,3.8]])pine(stone,needles,x,0,z,h);
  const basinX=1.05, startZ=7.8, endZ=-6.2;
  for(const side of [-1,1])slab(paint,basinX+side*0.25,0.16,(startZ+endZ)/2,0.13,0.27,startZ-endZ,'#969c8d');
  for(const side of [-1,1])slab(paint,2.02,0.14,endZ+side*0.21,2.2,0.24,0.11,'#919988');
  slab(paint,2.02,0.06,endZ,2.22,0.1,0.48,'#949a8d');
  const bx=basinX,bz=startZ+.47;
  const bowl=[[.34,0],[.40,.08],[.33,.15],[.38,.28],[.55,.40],[.67,.63],[.66,.79],[.58,.80],[.50,.65],[.30,.47],[0,.45]];
  brush(new T.LatheGeometry(bowl.map(([r,h])=>new T.Vector2(r,h)),18).translate(bx,0,bz),'#9caa96',rock);
  for(const [h,r] of [[.12,.37],[.49,.59],[.63,.66]])brush(new T.TorusGeometry(r,.016,5,36).rotateX(Math.PI/2).translate(bx,h,bz),'#848f81',stone);
  for(let i=0;i<18;i++){
    const a=i*TAU/18;
    brush(new T.SphereGeometry(.065,7,5).scale(.9,.44,.6).rotateY(-a).translate(bx+.65*Math.sin(a),.69,bz+.65*Math.cos(a)),'#b0b59e',stone);
  }
  // A partly roofed entrance feeds the stone basin from a projecting half-pipe.
  for(const side of [-1,1])post(paint,side*1.79,9.9,.02,2.86);
  roof(paint,0,2.98,9.62,2.42,1.21,1.01);
  bar(stone,V(bx,2.99,9.0),V(bx,2.72,bz),.082,'#7d8875',.066);
  // Hand-shaped split bamboo chute, including its hollow cut end and raised nodes.
  const bamboo=createBatch(wash.alwaysBoth);
  const cyl=(r,h,col)=>brush(new T.CylinderGeometry(r,r,h,20,1,true,-Math.PI/2,Math.PI).rotateX(Math.PI/2),col,bamboo);
  cyl(0.145,1.42,'#ae9b55');
  for(const z of [-0.61,-0.2,0.35,0.67])brush(new T.CylinderGeometry(0.157,0.157,0.036,20,1,true,-Math.PI/2,Math.PI).rotateX(Math.PI/2).translate(0,0,z),'#6c7549',bamboo);
  const spout=bamboo.build();spout.position.set(basinX,0.74,startZ-0.07);scene.add(spout);
  const bell=createBatch(wash.alwaysBoth);
  const prof=[[0,0.12],[0.09,0.13],[0.18,0.06],[0.19,-0.16],[0.26,-0.25],[0.24,-0.28],[0.18,-0.23]];
  brush(new T.LatheGeometry(prof.map(([x,y])=>new T.Vector2(x,y)),20),'#977a45',bell);
  bar(bell,V(0,0.12,0),V(0,0.43,0),0.018,'#715344');bar(bell,V(0,-0.14,0),V(0,-0.45,0),0.012,WOOD);
  const chime=bell.build();chime.position.set(2.16,2.67,-9.82);scene.add(chime);
  for(const batch of [stone,rock,paint,needles])scene.add(batch.build());
  return {spout,chime,basinX,startZ,endZ};
}

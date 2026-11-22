import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadMan } from './figure/man.js';
import { field, hue } from './pencil.js';
import { roll, turned, ring } from './shape.js';

const V = (x,y,z) => new T.Vector3(x,y,z);
const TAU = 2*Math.PI;
const ink = '#263a40', indigo = '#405962', leather = '#4d3c32', brass = '#ad9062';

// All garment pieces are drawn in the same metre-scale rest space as the GLB.
// Keeping the original adult head, hands and brows also keeps their joint weights.
export async function createWayfarer(material) {
  const man=await loadMan({base:'./figure/'});
  const group=man.object;
  group.updateMatrixWorld(true);
  for(const mesh of man.meshes){
    const name=mesh.material.name;
    const body=name.endsWith('.body');
    const brows=name.includes('eyebrow'), lashes=name.includes('eyelashes');
    const eyes=name.includes('high-poly'), hair=name.includes('short01');
    mesh.visible=body||brows||lashes||eyes||hair;
    if(!mesh.visible)continue;
    const g=mesh.geometry.clone(), p=g.getAttribute('position');
    if(body){
      const indices=g.getIndex().array, exposed=[];
      for(let i=0;i<indices.length;i+=3){
        const j=indices[i],k=indices[i+1],l=indices[i+2];
        if([j,k,l].some(v=>p.getY(v)>1.555||Math.abs(p.getX(v))>.695))exposed.push(j,k,l);
      }
      g.setIndex(exposed);
    }
    field(g);
    hue(g,body?'#c39b7f':eyes?'#3d342d':hair?'#292e30':'#3b3028');
    mesh.material=material;mesh.geometry=g;
  }
  const names=Object.keys(man.bones),bones=names.map(k=>man.bones[k]);
  const joints=new Map(names.map((k,i)=>[k,i]));
  const skeleton=new T.Skeleton(bones,bones.map(b=>b.matrixWorld.clone().invert()));
  const at=k=>man.bones[k].getWorldPosition(new T.Vector3());
  const pieces=[];
  function sew(g,colour,attachment) {
    if(!g.attributes.normal)g.computeVertexNormals();
    field(g);hue(g,colour);
    const p=g.attributes.position,indices=new Uint16Array(p.count*4),weights=new Float32Array(p.count*4);
    for(let i=0;i<p.count;i++){
      const blend=typeof attachment==='string'?[[attachment,1]]:attachment(p.getX(i),p.getY(i),p.getZ(i));
      blend.forEach(([k,w],n)=>{indices[4*i+n]=joints.get(k);weights[4*i+n]=w;});
    }
    g.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
    g.deleteAttribute('uv');pieces.push(g.index?g.toNonIndexed():g);
  }
  function trim(points,r,colour,bone) {
    sew(roll(points,r,{around:6,every:.035}),colour,bone);
  }
  function section(a,b,shape,colour,attachment,segments=20) {
    const axis=b.clone().sub(a),length=axis.length(),q=new T.Quaternion().setFromUnitVectors(V(0,1,0),axis.normalize());
    const g=turned(shape.map(([t,r])=>[r,length*t]),segments).applyQuaternion(q).translate(a.x,a.y,a.z);
    sew(g,colour,attachment);
  }
  function shell(levels,attachment,colour,from=-Math.PI,to=Math.PI,fold=.024) {
    const vertices=[],idx=[],sides=48;
    levels.forEach(([y,rx,rz,cz],row)=>{
      for(let i=0;i<=sides;i++){
        const a=from+(to-from)*i/sides,r=1+fold*Math.cos(9*a+row*.17);
        vertices.push(Math.sin(a)*rx*r,y,cz+Math.cos(a)*rz*r);
        if(row&&i){const k=row*(sides+1)+i;idx.push(k-1,k-sides-2,k,k,k-sides-2,k-sides-1);}
      }
    });
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(idx);g.computeVertexNormals();sew(g,colour,attachment);
  }
  const torso=(_x,y)=>{
    const k=T.MathUtils.smoothstep(y,1.03,1.44);
    return [['pelvis',1-k],['spine_03',k]];
  };
  const skirt=(x,y)=>{
    const k=.63*(1-T.MathUtils.smoothstep(y,.38,.98));
    return [['pelvis',1-k],[x>0?'thigh_l':'thigh_r',k]];
  };
  // Overlapping robe fronts, a pale standing collar and a woven waist sash.
  shell([[1.58,.081,.077,-.015],[1.52,.175,.113,-.019],[1.45,.211,.141,-.025],[1.3,.192,.133,-.02],[1.12,.151,.122,-.008],[1.02,.174,.133,-.006]],torso,indigo);
  shell([[1.09,.168,.132,-.004],[1.00,.184,.144,0],[.82,.221,.173,-.008],[.58,.259,.194,-.022],[.34,.282,.228,-.059]],skirt,'#344e56',.26,TAU+.02,.067);
  shell([[1.05,.178,.135,0],[.9,.196,.154,.002],[.66,.223,.182,.004],[.44,.244,.204,-.004]],skirt,'#53696c',-.93,.21,.032);
  function ribbon(path,width,colour,bone){
    const v=[],idx=[];
    path.forEach(([x,y,z],i)=>{
      v.push(x-width*.5,y,z,x+width*.5,y,z+.002);
      if(i){const k=i*2;idx.push(k-2,k-1,k,k,k-1,k+1);}
    });
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();sew(g,colour,bone);
  }
  ribbon([[.075,1.582,.01],[.075,1.52,.079],[.022,1.456,.115],[-.043,1.38,.123]],.043,'#ddd4bb',torso);
  ribbon([[-.084,1.575,.016],[-.097,1.519,.076],[-.061,1.454,.124],[.024,1.36,.131],[.101,1.25,.109],[.137,1.14,.067]],.05,'#ddd4bb',torso);
  shell([[1.16,.164,.134,-.006],[1.13,.171,.137,-.003],[1.075,.174,.138,0],[1.059,.172,.135,0]],torso,'#665140');
  for(const y of [1.076,1.137])shell([[y+.007,.174,.14,-.002],[y,.174,.14,-.002]],torso,'#ab956a');
  ribbon([[.115,1.127,.099],[.123,1.015,.105],[.15,.84,.132],[.19,.77,.111]],.048,'#816248','pelvis');
  for(const s of ['l','r']){
    const sh=at('upperarm_'+s),el=at('lowerarm_'+s),wr=at('hand_'+s);
    section(sh,el,[[-.16,.050],[0,.096],[.18,.106],[.75,.092],[1.12,.081]],indigo,'upperarm_'+s);
    section(el,wr,[[-.12,.079],[.18,.091],[.7,.057],[.92,.047]],'#4a656b','lowerarm_'+s);
    section(el,wr,[[.53,.066],[.61,.069],[.96,.048],[1.01,.045]],ink,'lowerarm_'+s);
    for(const t of [.62,.71,.80,.89])section(el,wr,[[t,.068-(t-.62)*.064],[t+.022,.068-(t-.62)*.064]],'#75817a','lowerarm_'+s);
    const hip=at('thigh_'+s),knee=at('calf_'+s),ankle=at('foot_'+s);
    section(hip,knee,[[0,.094],[.45,.109],[.88,.088],[1.09,.073]],'#445254','thigh_'+s);
    section(knee,ankle,[[-.08,.079],[.14,.084],[.55,.059],[.98,.052]],ink,'calf_'+s);
    section(knee,ankle,[[.45,.068],[.5,.071],[.98,.054]],leather,'calf_'+s);
    sew(new T.SphereGeometry(1,20,12).scale(.070,.066,.146).translate(ankle.x,.074,ankle.z+.066),leather,'foot_'+s);
  }
  // Facial anatomy comes from the source mesh. The hair knot, hat and chin ties
  // follow the head, so the brim tilts with the player's nod at the rain channel.
  const head='Head',c=V(0,1.784,-.012);
  sew(new T.SphereGeometry(1,20,12).scale(.064,.06,.063).translate(0,1.844,-.064),'#252c2d',head);
  trim([V(0,1.82,-.069),V(.025,1.69,-.128),V(.046,1.49,-.165),V(.038,1.40,-.172)],t=>.046*(1-.8*t),'#2b3233',head);
  const r=.368, yAt=u=>.161*(1-u**.82)-.047*u*u;
  const hat=turned(Array.from({length:15},(_,i)=>[i/14*r,yAt(i/14)]),80).rotateZ(-.064).translate(c.x,c.y,c.z);
  sew(hat,(x,y,z)=>0.5+.5*Math.cos(24*Math.atan2(x,z-c.z))>.58?'#ae9264':'#97805b',head);
  for(const u of [.24,.42,.58,.72,.84,.93,1]){
    const loop=ring(V(0,yAt(u),0),V(0,1,0),r*u,64);
    const g=roll(loop,u===1?.007:.0025,{closed:true,around:4,every:.025}).rotateZ(-.064).translate(c.x,c.y,c.z);
    sew(g,u===1?'#64533d':'#b69d74',head);
  }
  for(const side of [-1,1])trim([V(side*.132,1.794,0),V(side*.092,1.699,.045),V(side*.038,1.605,.082),V(.003,1.598,.085)],.0035,leather,head);
  // A travel sword stays in its scabbard. The brass fittings and bound grip
  // break the shoulder silhouette, and move with the upper spine.
  const low=V(.27,.69,-.15),high=V(-.18,1.53,-.176),vector=high.clone().sub(low).normalize();
  section(low,high,[[0,.018],[.045,.032],[.98,.042],[1,.044]],'#453f35','spine_03',10);
  for(const t of [.04,.73,.96])section(low,high,[[t,.04],[t+.018,.042]],brass,'spine_03',10);
  const hiltEnd=high.clone().addScaledVector(vector,.235);
  section(high,hiltEnd,[[0,.041],[.10,.03],[.86,.022],[1,.035]],leather,'spine_03',10);
  for(const t of [.21,.37,.53,.69,.85])section(high,hiltEnd,[[t,.028],[t+.04,.029]],brass,'spine_03',8);
  trim([high.clone().add(V(-.081,-.035,0)),high,high.clone().add(V(.074,.044,0))],.015,brass,'spine_03');
  trim([hiltEnd,hiltEnd.clone().add(V(-.035,-.084,0)),hiltEnd.clone().add(V(-.066,-.158,-.015))],.006,'#854838','spine_03');
  const outfit=new T.SkinnedMesh(mergeGeometries(pieces),material);
  group.add(outfit);outfit.bind(skeleton,new T.Matrix4());outfit.frustumCulled=false;
  const shoulder=man.bones.upperarm_r,elbow=man.bones.lowerarm_r,hand=man.bones.hand_r;
  const pointOf=bone=>bone.getWorldPosition(new T.Vector3());
  function aim(bone,tip,target,weight){
    const pivot=pointOf(bone),from=pointOf(tip).sub(pivot).normalize(),to=target.clone().sub(pivot).normalize();
    const parent=bone.parent.getWorldQuaternion(new T.Quaternion());
    const turn=new T.Quaternion().setFromUnitVectors(from,to);
    const local=parent.clone().invert().multiply(turn).multiply(parent).multiply(bone.quaternion);
    bone.quaternion.slerp(local,weight);bone.updateWorldMatrix(false,true);
  }
  function reach(target,weight){
    if(weight<=0)return;
    const start=pointOf(shoulder),offset=target.clone().sub(start),axis=offset.clone().normalize();
    const upper=start.distanceTo(pointOf(elbow)),lower=pointOf(elbow).distanceTo(pointOf(hand));
    const d=T.MathUtils.clamp(offset.length(),Math.abs(upper-lower)+.001,upper+lower-.005);
    const along=(upper*upper+d*d-lower*lower)/(2*d);
    const outward=V(.42,-1,.36);outward.addScaledVector(axis,-outward.dot(axis)).normalize();
    const joint=start.clone().addScaledVector(axis,along).addScaledVector(outward,Math.sqrt(Math.max(0,upper*upper-along*along)));
    aim(shoulder,elbow,joint,weight);aim(elbow,hand,target,weight);
  }
  return {group,man,reach};
}

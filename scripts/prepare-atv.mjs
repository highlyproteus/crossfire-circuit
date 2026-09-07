import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'source-assets/meshy-assets.json'),'utf8'));
const io=new NodeIO(),doc=await io.read(path.resolve(root,'source-assets',manifest.images.find(a=>a.id==='atv').model_path));
const old=doc.getRoot().listMeshes()[0],primitive=old.listPrimitives()[0],position=primitive.getAttribute('POSITION'),indices=primitive.getIndices().getArray();
const scale=2.9/(.947624+.949448),bottom=-.576522;
const transform=([x,y,z])=>[z*scale,(y-bottom)*scale-.89,-x*scale];
const groups=[{name:'Chassis',pivot:[0,0,0],faces:[]}];
for(const x of [-.637,.637])for(const z of [-.565,.565])groups.push({name:`Wheel_${x<0?'Front':'Rear'}_${z>0?'Left':'Right'}`,pivot:transform([x,-.255,z]),faces:[],x,z});
const semantics=primitive.listSemantics();
const vertex=id=>Object.fromEntries(semantics.map(s=>[s,primitive.getAttribute(s).getElement(id,[])]));
const mix=(a,b,t)=>Object.fromEntries(semantics.map(s=>[s,a[s].map((v,i)=>v+(b[s][i]-v)*t)]));
function triangulate(polygon,group){for(let j=1;j+1<polygon.length;j++)group.faces.push(polygon[0],polygon[j],polygon[j+1]);}
// Clip triangles at the inner wheel boundary instead of assigning whole faces.
// This prevents connected axle/suspension triangles from spinning as loose flaps.
function split(polygon,distance){
  const inside=[],outside=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a.POSITION),db=distance(b.POSITION);
    (da>=0?inside:outside).push(a);
    if((da>=0)!==(db>=0)){const cut=mix(a,b,da/(da-db));inside.push(cut);outside.push(cut);}
  }
  return [inside,outside];
}
for(let i=0;i<indices.length;i+=3){
  let polygon=[vertex(indices[i]),vertex(indices[i+1]),vertex(indices[i+2])];
  const c=[0,0,0];for(const v of polygon)for(let d=0;d<3;d++)c[d]+=v.POSITION[d]/3;
  const wheel=groups.slice(1).find(g=>Math.sign(c[2])===Math.sign(g.z)&&Math.sign(c[0])===Math.sign(g.x));
  const planes=[p=>Math.sign(wheel.z)*p[2]-.435];
  for(let a=0;a<24;a++){const angle=a/24*Math.PI*2;planes.push(p=>.346-Math.cos(angle)*(p[0]-wheel.x)-Math.sin(angle)*(p[1]+.255));}
  for(const distance of planes){const [inside,outside]=split(polygon,distance);triangulate(outside,groups[0]);polygon=inside;if(polygon.length<3)break;}
  triangulate(polygon,wheel);
}
const scene=doc.getRoot().listScenes()[0];for(const node of scene.listChildren())node.dispose();
const rootNode=doc.createNode('ATV');scene.addChild(rootNode);const buffer=doc.getRoot().listBuffers()[0];
for(const group of groups){
  const used=[...new Set(group.faces)],remap=new Map(used.map((v,i)=>[v,i])),out=doc.createPrimitive().setMaterial(primitive.getMaterial());
  for(const semantic of primitive.listSemantics()){
    const input=primitive.getAttribute(semantic),width=input.getElementSize(),arr=new (input.getArray().constructor)(used.length*width);
    used.forEach((vertex,i)=>{
      const value=vertex[semantic];
      let next=value;
      if(semantic==='POSITION')next=transform(value).map((v,d)=>v-group.pivot[d]);
      if(semantic==='NORMAL'){const length=Math.hypot(...value)||1;next=[value[2]/length,value[1]/length,-value[0]/length];}
      arr.set(next,i*width);
    });
    out.setAttribute(semantic,doc.createAccessor().setType(input.getType()).setArray(arr).setBuffer(buffer));
  }
  out.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(group.faces.map(id=>remap.get(id)))).setBuffer(buffer));
  rootNode.addChild(doc.createNode(group.name).setTranslation(group.pivot).addChild(doc.createNode(group.name+'Geometry').setMesh(doc.createMesh(group.name).addPrimitive(out))));
  console.log(group.name,group.faces.length/3,'triangles');
}
old.dispose();
const folder=path.join(root,'work/prepared');await fs.mkdir(folder,{recursive:true});await io.write(path.join(folder,'atv.glb'),doc);

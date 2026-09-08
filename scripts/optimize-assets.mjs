import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'source-assets/meshy-assets.json'),'utf8'));
await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder,
});
const results=[];
for(const asset of manifest.images){
  const sourcePath=asset.id==='rider'?manifest.rigging.model_path:asset.model_path;
  if(!sourcePath)throw new Error(`${asset.id} has not finished generating.`);
  const source=path.resolve(root,'source-assets',sourcePath);
  const prepared=path.join(root,'work/prepared',`${asset.id}.glb`);
  const input=await fs.access(prepared).then(()=>prepared).catch(()=>source);
  const doc=await io.read(input);
  await doc.transform(dedup(),weld(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:85}),meshopt({encoder:MeshoptEncoder,level:'medium'}));
  const output=path.join(root,'public/models',`${asset.id}.glb`);
  await io.write(output,doc);
  results.push({id:asset.id,source,input,output,bytes:(await fs.stat(output)).size});
  console.log(asset.id,results.at(-1).bytes);
}
await fs.writeFile(path.join(root,'public/models/manifest.json'),JSON.stringify(results.map(({id,bytes})=>({id,bytes})),null,2));
const reports=path.join(root,'work/reports');
await fs.mkdir(reports,{recursive:true});
await fs.writeFile(path.join(reports,'asset-build.json'),JSON.stringify(results,null,2));

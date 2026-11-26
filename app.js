import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';
import { GLTFLoader } from './GLTFLoader.js';

const $=id=>document.getElementById(id);
let renderer,scene,camera,controls,model,villa,roomInstance,contactShadow,mode='exterior',failed=false,ready=false;
let villaPromise,villaError=false,focusedRoom=false,dirty=true;
const cutaway=[];
const states={
  exterior:{label:'整体外观',title:'简洁外壳，完整空间',copy:'银白板面、规则分缝和独立边框构成整体外观。顶部设备区与主体分开呈现。',tags:['板式外观','顶部设备区','独立箱体'],camera:[6.3,4.1,9],target:[0,1.2,0]},
  interior:{label:'内部布局',title:'让有限空间，有序展开',copy:'座榻下方整合储物，墙面设置柜体与搁架。暖光和软垫呈现可停留的居家空间意向。',tags:['座榻储物','墙面收纳','暖光内装'],camera:[5.4,4.4,8],target:[0,1.15,0]},
  scenario:{label:'应用场景 / 别墅地下室',title:'融入住宅，安于一隅',copy:'地上是车库、厨房与起居空间；地下室的一间房内嵌入同款安全屋。金色轮廓标出它在整栋住宅中的位置。',tags:['别墅剖面','地下室房间','同款安全屋'],camera:[12.4,10.6,19.8],target:[0,4.5,0]}
};
if(states[location.hash.slice(1)])mode=location.hash.slice(1);
function setMode(next){
  mode=next;const s=states[mode];
  history.replaceState(null,'',`#${mode}`);
  focusedRoom=false;
  for(const id of ['exterior','interior','scenario']){$(id).classList.toggle('active',id===mode);$(id).setAttribute('aria-pressed',String(id===mode));}
  $('mode-label').textContent=s.label;$('mode-title').textContent=s.title;$('mode-copy').textContent=s.copy;
  $('tags').replaceChildren(...s.tags.map(t=>{const el=document.createElement('span');el.textContent=t;return el;}));
  $('view-badge').textContent=mode==='scenario'?'应用场景 · 别墅地下室':mode==='interior'?'独立展台 · 内部剖开':'独立展台 · 整体视角';
  $('cutaway-label').hidden=mode!=='interior';
  $('fallback-img').src=`${mode}.png`;
  cutaway.forEach(o=>o.visible=mode!=='interior');
  if(model)model.visible=mode!=='scenario';
  if(villa)villa.visible=mode==='scenario';
  if(contactShadow)contactShadow.scale.setScalar(mode==='scenario'?2.25:1);
  for(const id of ['scenario-actions','scenario-note'])$(id).hidden=mode!=='scenario';
  $('scenario-labels').hidden=mode!=='scenario'||!villa||failed;
  $('focus-room').disabled=$('overview').disabled=!villa||failed;
  if(ready&&!failed)$('model-state').textContent=mode==='scenario'?(villa?'别墅剖面 · 同款模型':'正在准备别墅场景'):'三维模型 · 可交互';
  if(!failed){
    $('fallback').hidden=mode!=='scenario'||!villaError;
    if(mode==='scenario'&&ready&&!villa&&!villaError){$('loading').hidden=false;$('progress').textContent='正在载入别墅场景…';loadVilla();}
    else if(ready)$('loading').hidden=true;
  }
  dirty=true;
  if(controls){controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');resetView();}
}
function resetView(){if(!ready)return;focusedRoom=false;controls.minDistance=mode==='scenario'?8:5;controls.maxDistance=mode==='scenario'?42:17;camera.position.fromArray(states[mode].camera);controls.target.fromArray(states[mode].target);controls.update();dirty=true;}
function focusRoom(){if(!villa||mode!=='scenario'||failed)return;focusedRoom=true;controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');controls.target.set(2,1.65,.65);camera.position.set(8.2,4.2,11.8);controls.update();dirty=true;}
function loadVilla(){
  if(villaPromise)return villaPromise;
  villaPromise=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Villa load timeout')),25000);
    new GLTFLoader().load('./villa-environment.glb',gltf=>{clearTimeout(timer);resolve(gltf.scene);},undefined,e=>{clearTimeout(timer);reject(e);});
  }).then(environment=>{
    villa=new THREE.Group();villa.name='VillaApplicationScenario';villa.add(environment);
    environment.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(/Location highlight/.test(o.material.name)){o.material.color.set(0xffb42d);o.material.emissive.set(0xffa01c);o.material.emissiveIntensity=.9;o.material.metalness=0;}}});
    // Clone the exact loaded asset, sharing its geometry and tuned materials. No substitute door.
    roomInstance=model.clone(true);roomInstance.name='SameSafeRoomInBasement';roomInstance.visible=true;roomInstance.position.set(2,.2,.65);
    roomInstance.traverse(o=>{o.visible=!o.name.startsWith('Exhibit_');});villa.add(roomInstance);
    const light=new THREE.DirectionalLight(0xffebd2,1.05);light.position.set(-6,16,10);villa.add(light);
    const ambient=new THREE.HemisphereLight(0xd8e9f4,0x676056,.35);villa.add(ambient);
    scene.add(villa);villa.visible=mode==='scenario';dirty=true;
    if(mode==='scenario'){setMode('scenario');$('model-state').textContent='别墅剖面 · 同款模型';}
  }).catch(error=>{villaError=true;console.error('Villa unavailable:',error);if(mode==='scenario'){$('loading').hidden=true;$('fallback').hidden=false;$('model-state').textContent='场景静态预览';}});
  return villaPromise;
}
function updateSceneLabels(){
  if(mode!=='scenario'||!villa||failed)return;
  const host=$('canvas-host'),w=host.clientWidth,h=host.clientHeight;
  const anchors=[['floor-upper',[-5.35,8.3,2.9]],['floor-ground',[-5.35,5.2,2.9]],['floor-basement',[-5.35,1.8,2.9]],['room-pin',[4.45,1.8,2.4]]];
  for(const [id,point] of anchors){const el=$(id),v=new THREE.Vector3(...point).project(camera);const x=(v.x*.5+.5)*w,y=(-v.y*.5+.5)*h;el.hidden=v.z>1||v.z<-1||x<-30||x>w+30||y<65||y>h-65||(focusedRoom&&id!=='room-pin');const left=id==='room-pin'?THREE.MathUtils.clamp(x,el.offsetWidth/2+10,w-el.offsetWidth/2-10):THREE.MathUtils.clamp(x,el.offsetWidth+8,w-12);el.style.left=`${left}px`;el.style.top=`${y}px`;}
}
function fallback(error){failed=true;ready=false;$('loading').hidden=true;$('fallback').hidden=false;$('model-state').textContent='静态预览模式';for(const id of ['rotate','zoom-in','zoom-out','reset'])$(id).disabled=true;$('interaction-hint').textContent='可切换整体 / 内部图片';console.error('3D viewer unavailable:',error);}
function zoom(factor){if(!ready)return;const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();}
// Fine surface relief: material texture, not illustrative imagery.
function surfaceTexture(kind){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(256,256);
  let seed=7143;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    let v=128;
    if(kind==='fabric')v=110+28*Math.sin(x*Math.PI/2)*Math.cos(y*Math.PI/2)+random()*35;
    else if(kind==='metal')v=120+random()*16+8*Math.sin(y*1.9);
    else v=100+random()*35+18*Math.sin(x*.12+Math.sin(y*.025)*.8);
    const i=(y*256+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);const tex=new THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(kind==='metal'?2:5,kind==='metal'?10:5);return tex;
}
$('exterior').onclick=()=>setMode('exterior');$('interior').onclick=()=>setMode('interior');$('scenario').onclick=()=>setMode('scenario');
$('focus-room').onclick=focusRoom;$('room-pin').onclick=focusRoom;$('overview').onclick=()=>setMode('scenario');
$('reset').onclick=()=>{if(controls)controls.autoRotate=false;$('rotate').setAttribute('aria-pressed','false');resetView();};
$('rotate').onclick=()=>{if(!ready)return;controls.autoRotate=!controls.autoRotate;$('rotate').setAttribute('aria-pressed',String(controls.autoRotate));};
$('zoom-in').onclick=()=>zoom(.85);$('zoom-out').onclick=()=>zoom(1.18);$('retry').onclick=()=>location.reload();
setMode(mode);

try{
  const host=$('canvas-host');
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','拖动旋转安全屋模型，滚轮缩放');
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback('WebGL context lost');});
  scene=new THREE.Scene();scene.background=new THREE.Color(0x182027);scene.fog=new THREE.FogExp2(0x182027,.028);camera=new THREE.PerspectiveCamera(38,1,.1,100);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;
  controls.minDistance=5;controls.maxDistance=17;controls.minPolarAngle=.25;controls.maxPolarAngle=Math.PI*.49;controls.autoRotateSpeed=.65;
  scene.add(new THREE.HemisphereLight(0xdce6ed,0x39312b,.65));
  const key=new THREE.DirectionalLight(0xffecd7,2.1);key.position.set(-3,7,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.normalBias=.015;key.shadow.bias=-.0001;key.shadow.radius=3;scene.add(key);
  const fill=new THREE.DirectionalLight(0xc8d9ee,.45);fill.position.set(4,2,3);scene.add(fill);
  const rim=new THREE.DirectionalLight(0xc7d9ea,1.8);rim.position.set(2,5,-5);scene.add(rim);
  const warmInterior=new THREE.PointLight(0xffc78c,8,3,2);warmInterior.position.set(.35,1.65,-.65);scene.add(warmInterior);
  // A local procedural studio environment gives metal visible reflections without network assets.
  const envScene=new THREE.Scene();envScene.background=new THREE.Color().setRGB(.22,.24,.27);
  for(const [pos,size,intensity] of [[[0,3,6],[7,4,.1],2.2],[[5,3,0],[.1,5,5],1.4],[[-4,2,-1],[.1,4,1],1],[[0,6,0],[6,.1,3],1.8]]){
    const panel=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(intensity,intensity,intensity)}));panel.position.set(...pos);envScene.add(panel);
  }
  const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromScene(envScene,.04);scene.environment=env.texture;pmrem.dispose();
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x202b32,roughness:.48,metalness:.25}));ground.rotation.x=-Math.PI/2;ground.position.y=-.425;ground.receiveShadow=false;scene.add(ground);
  const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=128;const contactCtx=contactCanvas.getContext('2d');const grad=contactCtx.createRadialGradient(64,64,20,64,64,63);grad.addColorStop(0,'rgba(0,0,0,.65)');grad.addColorStop(1,'rgba(0,0,0,0)');contactCtx.fillStyle=grad;contactCtx.fillRect(0,0,128,128);
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(7,6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(contactCanvas),transparent:true,depthWrite:false}));contact.rotation.x=-Math.PI/2;contact.position.y=-.42;scene.add(contact);contactShadow=contact;
  const timer=setTimeout(()=>{if(!ready)fallback('Model loading timed out');},25000);
  new GLTFLoader().load('./safe-room-v1.glb',gltf=>{
    clearTimeout(timer);if(failed)return;model=gltf.scene;
    const brushed=surfaceTexture('metal'),woven=surfaceTexture('fabric'),grain=surfaceTexture('wood');const tuned=new Set();
    model.traverse(o=>{
      if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const m=o.material;
        if(!tuned.has(m)){tuned.add(m);
          if(/Satin silver/.test(m.name)){m.color.setRGB(.48,.52,.55);m.metalness=.78;m.roughness=.36;m.bumpMap=brushed;m.bumpScale=.0005;}
          if(/Brushed bright/.test(m.name)){m.color.setRGB(.67,.7,.72);m.metalness=.95;m.roughness=.2;m.bumpMap=brushed;m.bumpScale=.001;}
          if(/upholstery|cushions/.test(m.name)){m.color.set(/cushions/.test(m.name)?0x9a8167:0x6e5d4b);m.metalness=0;m.roughness=.95;m.bumpMap=woven;m.bumpScale=.012;}
          if(/Warm interior/.test(m.name)){m.color.set(0x8f887b);m.roughness=.65;m.metalness=.08;}
          if(/Interior floor/.test(m.name)){m.color.set(0x69503a);m.bumpMap=grain;m.bumpScale=.008;m.roughness=.6;}
          if(/Equipment enamel/.test(m.name)){m.color.set(0xc5c8c5);m.roughness=.38;m.metalness=.15;}
          if(/Exhibition graphite/.test(m.name)){m.color.set(0x263238);m.metalness=.45;m.roughness=.3;m.bumpMap=brushed;m.bumpScale=.003;}
          m.needsUpdate=true;
        }
      }
      if(/^(cut_|Top_|Equipment_edge)/.test(o.name))cutaway.push(o);
    });
    scene.add(model);ready=true;$('loading').hidden=true;$('model-state').textContent='三维模型 · 可交互';setMode(mode);
  },e=>{if(e.total)$('progress').textContent=`模型加载 ${Math.round(e.loaded/e.total*100)}%`;},e=>{clearTimeout(timer);fallback(e);});
  controls.addEventListener('change',()=>{dirty=true;});
  function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;}
  new ResizeObserver(resize).observe(host);resize();
  let lastFrame=0;
  renderer.setAnimationLoop(time=>{if(failed||time-lastFrame<33)return;lastFrame=time;controls.update();if(dirty||!ready){renderer.render(scene,camera);updateSceneLabels();dirty=false;}});
}catch(error){fallback(error);}



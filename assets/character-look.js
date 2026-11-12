import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

// Original procedural surface treatment and expedition gear. No image requests,
// extra animation clocks or modified source textures are involved.
export function createCharacterLook(THREE, resources) {
  const rememberMaterial = material => {
    resources.material.add(material);
    for (const value of Object.values(material)) if (value?.isTexture) resources.texture.add(value);
    return material;
  };
  const surfaceShader = material => {
    if (material.userData.emberSurface?.uEmberTint?.value?.isVector3) return material.userData.emberSurface;
    const uniforms = {
      uEmberTint: { value: new THREE.Vector3(1, 1, 1) },
      uEmberWear: { value: .12 },
      uEmberStain: { value: 0 },
      uEmberDesaturate: { value: .15 },
      uEmberScale: { value: 7 }
    };
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'varying vec3 vEmberSurface;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmberSurface = position;');
      shader.fragmentShader = `
        varying vec3 vEmberSurface;
        uniform vec3 uEmberTint;
        uniform float uEmberWear, uEmberStain, uEmberDesaturate, uEmberScale;
        float emberHash(vec3 p) {
          p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float emberNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(emberHash(i),emberHash(i+vec3(1,0,0)),f.x),
                         mix(emberHash(i+vec3(0,1,0)),emberHash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(emberHash(i+vec3(0,0,1)),emberHash(i+vec3(1,0,1)),f.x),
                         mix(emberHash(i+vec3(0,1,1)),emberHash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 emberP = vEmberSurface * uEmberScale;
        float emberWear = smoothstep(.28,.82,emberNoise(emberP)*.72 + emberNoise(emberP*2.1+11.7)*.28);
        float emberStain = smoothstep(.60,.84,emberNoise(emberP*.63+vec3(19.7,4.1,11.3)));
        float emberLuma = dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(emberLuma),uEmberDesaturate);
        diffuseColor.rgb *= uEmberTint * (1.0 - emberWear*uEmberWear);
        diffuseColor.rgb = mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.68,.46,.31),emberStain*uEmberStain);
      `);
    };
    // Surface variations are uniforms; each compatible material can share a
    // shader program while retaining its own treatment and original texture.
    material.customProgramCacheKey = () => 'ember-weathered-surface-01';
    material.userData.emberSurface = uniforms;
    material.needsUpdate = true;
    return uniforms;
  };

  function styleMaterial(material, original, state = {}) {
    const enemy = !!state.isEnemy, heavy = !!state.type;
    const name = (original?.name || material.name || '').toLowerCase();
    material.color?.copy(original?.color || new THREE.Color(1,1,1));
    const cloth = /original top|original bottom|casual|cloth/.test(name);
    const skin = /anatomical body\.body|\bskin\b/.test(name);
    const shoe = /shoes|leather/.test(name);
    // Hair, teeth and eye surfaces keep their source treatment; muddy teeth and
    // flattened transparent hair produce conspicuous artifacts at game scale.
    if (!cloth && !skin && !shoe) return material;
    const u = surfaceShader(material);
    if (cloth) {
      material.roughness = .96;
      u.uEmberTint.value.set(...(enemy ? (heavy ? [.78,.76,.71] : [.86,.88,.81]) : [.91,.88,.80]));
      u.uEmberWear.value = enemy ? .34 : .18;
      u.uEmberStain.value = enemy ? .65 : .16;
      u.uEmberDesaturate.value = enemy ? .73 : .30;
    } else if (skin) {
      material.roughness = enemy ? .94 : Math.max(original?.roughness || .78,.78);
      u.uEmberTint.value.set(...(enemy ? [.89,.95,.86] : [1.0,.98,.94]));
      u.uEmberWear.value = enemy ? .17 : .035;
      u.uEmberStain.value = enemy ? .48 : .025;
      u.uEmberDesaturate.value = enemy ? .57 : .035;
    } else {
      material.roughness = .96;
      u.uEmberTint.value.set(.73,.70,.63);
      u.uEmberWear.value = .25;
      u.uEmberStain.value = .25;
      u.uEmberDesaturate.value = .5;
    }
    return material;
  }

  // Gear is merged into three material batches. Cloned bags share immutable
  // geometries/materials and stay within the renderer's existing resource sets.
  let backpackMeshes = null;
  function createBackpack() {
    if (!backpackMeshes) {
      const batches = [[], [], []];
      const tempColor = new THREE.Color();
      const piece = (geometry, batch, color, x=0, y=0, z=0, rotation=null) => {
        if (rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
        geometry.translate(x,y,z);
        const source=geometry, g=geometry.index?geometry.toNonIndexed():geometry;
        tempColor.set(color);
        const colors=new Float32Array(g.attributes.position.count*3);
        for(let i=0;i<colors.length;i+=3){colors[i]=tempColor.r;colors[i+1]=tempColor.g;colors[i+2]=tempColor.b;}
        g.setAttribute('color',new THREE.BufferAttribute(colors,3));
        batches[batch].push(g);
        if(g!==source)source.dispose();
      };
      const rounded = (width,height,depth,radius=2,bevel=.6) => {
        const x=-width/2,y=-height/2,r=Math.min(radius,width/2,height/2),shape=new THREE.Shape();
        shape.moveTo(x+r,y);shape.lineTo(x+width-r,y);shape.quadraticCurveTo(x+width,y,x+width,y+r);
        shape.lineTo(x+width,y+height-r);shape.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
        shape.lineTo(x+r,y+height);shape.quadraticCurveTo(x,y+height,x,y+height-r);
        shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
        return new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:3}).translate(0,0,-depth/2);
      };
      piece(rounded(18,24,10,3,1),0,0x61634f);
      piece(rounded(19,8,2,1.5,.45),0,0x6b6b55,0,9,-6);
      piece(rounded(12,8,3,1.5,.4),0,0x515640,0,-4,-7.5);
      piece(new THREE.CylinderGeometry(3.3,3.3,21,10),0,0x89836a,0,-15,0,[0,0,Math.PI/2]);
      // Binding around the rolled blanket, twin straps and a restrained carry loop.
      for(const x of [-6,6]) {
        piece(new THREE.BoxGeometry(2.2,22,.7),1,0x3b4030,x,-.5,-6.5);
        piece(new THREE.TorusGeometry(3.55,.5,4,10),1,0x3d4133,x,-15,0,[0,Math.PI/2,0]);
        for(const dx of [-1.7,1.7])piece(new THREE.BoxGeometry(.7,3.7,.8),2,0x77715a,x+dx,4,-7.2);
        for(const dy of [-1.6,1.6])piece(new THREE.BoxGeometry(3.6,.7,.8),2,0x77715a,x,4+dy,-7.2);
      }
      piece(new THREE.TorusGeometry(3,.55,4,10,Math.PI),1,0x333b2c,0,13,0);
      // Sparse edge stitches read as seams, not bright decorative stripes.
      for(const x of [-7,7])for(const y of [-9,-5,-1,3])piece(new THREE.BoxGeometry(.45,1.2,.35),0,0xa39b78,x,y,-6.1);
      const materials=[
        rememberMaterial(new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.98})),
        rememberMaterial(new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.96})),
        rememberMaterial(new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.8,metalness:.24}))
      ];
      const u=surfaceShader(materials[0]);u.uEmberScale.value=.10;u.uEmberWear.value=.12;u.uEmberDesaturate.value=.08;
      backpackMeshes=batches.map((parts,index)=>{
        const geometry=mergeGeometries(parts,false);parts.forEach(part=>part.dispose());
        resources.geometry.add(geometry);return {geometry,material:materials[index]};
      });
    }
    const bag=new THREE.Group();bag.name='Expedition_canvas_backpack';
    for(const mesh of backpackMeshes)bag.add(new THREE.Mesh(mesh.geometry,mesh.material));
    bag.visible=false;
    return bag;
  }
  return Object.freeze({styleMaterial,createBackpack});
}

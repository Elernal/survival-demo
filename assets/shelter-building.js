'use strict';
// Standalone, empty shelter building shell. No furniture or gameplay dependencies.
// Coordinates are authored in 1280x720 world space, matching the shelter character plane.
window.EmberShelterBuilding = (() => {
  const W=1280,H=720, floors=[{top:98,bottom:260},{top:279,bottom:443},{top:462,bottom:604}];
  let surface=null;
  function paint(){
    const c=document.createElement('canvas');c.width=W;c.height=H;
    const g=c.getContext('2d');
    const rect=(x,y,w,h,color)=>{g.fillStyle=color;g.fillRect(x,y,w,h)};
    const line=(x,y,xx,yy,color,width=1)=>{g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.moveTo(x,y);g.lineTo(xx,yy);g.stroke()};
    const grad=g.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,'#25353b');grad.addColorStop(.5,'#141e23');grad.addColorStop(1,'#090f13');rect(0,0,W,H,grad);
    // Ruined skyline and fog, visible through the exposed cross-section.
    for(let i=0;i<19;i++){const x=i*73-25,h=70+((i*67)%145);rect(x,210-h,54,h,i%3===0?'#1b2a2f':'#1b272c');for(let k=0;k<4;k++)rect(x+9+(k%2)*21,218-h+Math.floor(k/2)*34,9,14,'#55636533')}
    const fog=g.createLinearGradient(0,150,0,710);fog.addColorStop(0,'#85928d00');fog.addColorStop(1,'#55615a2a');rect(0,140,W,570,fog);
    // Exterior building mass, thick reinforced concrete, exposed cut edges.
    rect(49,65,1182,563,'#12191a');rect(62,77,1156,544,'#6d7068');rect(80,91,1120,512,'#20292a');
    // Interior back walls with subtle vertical variation and worn plaster.
    for(let i=0;i<floors.length;i++){
      const f=floors[i],bg=g.createLinearGradient(0,f.top,0,f.bottom);
      bg.addColorStop(0,i===0?'#4b5350':'#414a47');bg.addColorStop(.72,'#313a38');bg.addColorStop(1,'#242d2d');
      rect(95,f.top,1090,f.bottom-f.top,bg);
      rect(95,f.top,1090,9,'#131c1e88');
      // Low-frequency concrete panel seams and chipped edges.
      for(let x=115;x<1180;x+=128)line(x,f.top+12,x,f.bottom-9,'#a1a49a16',1);
      for(let j=0;j<100;j++){const x=100+(j*83+i*59)%1070,y=f.top+12+(j*41+i*13)%(f.bottom-f.top-24);rect(x,y,4+(j*7)%26,1+(j%2),'#d2cbb012')}
    }
    // Slabs, exposed reinforcing edge, three stories plus roof.
    for(const y of [76,262,445,604]){
      rect(43,y,1194,19,'#171f21');rect(43,y,1194,5,'#777d7477');
      rect(43,y+6,1194,8,'#424945');rect(43,y+18,1194,8,'#0a1012');
      for(let x=68;x<1215;x+=52)rect(x,y+10,18,2,'#938b734d');
    }
    // Outer support columns and two load-bearing partitions, open room frames.
    for(const x of [62,410,820,1195]){
      rect(x,76,23,548,'#1a2426');rect(x+3,80,6,535,'#737b7366');rect(x+17,81,3,530,'#0a1010aa');
      for(const y of [96,281,464])rect(x-3,y,30,9,'#515952');
    }
    // Window openings with deep reveals and simple mullions, no glazing assets.
    for(const [x,y] of [[156,128],[539,128],[935,128],[157,308],[537,308],[938,308],[155,492],[537,492]]){
      rect(x-7,y-7,137,94,'#151e20');rect(x,y,123,78,'#1a2c32');
      const sky=g.createLinearGradient(x,y,x,y+78);sky.addColorStop(0,'#3a5158');sky.addColorStop(1,'#202f35');rect(x+8,y+7,107,64,sky);
      rect(x+59,y,6,78,'#222a2b');rect(x,y+36,123,5,'#222a2b');rect(x-7,y+80,137,7,'#84867a');
    }
    // Empty doorway frames on each floor, ready for future door prefabs.
    for(const [x,y] of [[365,128],[778,308],[1035,489]]){
      rect(x-6,y-5,75,137,'#141d1f');rect(x+2,y+3,59,124,'#252e2e');
      rect(x-7,y-5,9,137,'#74786f');rect(x+61,y-5,9,137,'#555e58');rect(x-7,y-9,77,10,'#8b8b7d');
    }
    // Empty stairwell openings, reserved for future actual traversal.
    for(const [x,y] of [[1105,279],[1105,462]]){
      rect(x,y-9,79,22,'#0b1315');rect(x+5,y-8,70,3,'#737e7a88');
      for(let j=0;j<6;j++){const yy=y-110+j*18;line(x+8+j*7,yy,x+72,yy,'#8d948a55',4)}
    }
    // Foundation, soil and structural rubble silhouette (not interactable props).
    rect(0,628,W,92,'#101614');rect(0,628,W,9,'#4c524b');
    for(let i=0;i<55;i++){const x=(i*97)%W,y=644+(i*29)%65;rect(x,y,13+(i*11)%43,3+(i%5),'#343b35')}
    // Practical recessed window lighting and gentle ambient occlusion.
    g.save();g.globalCompositeOperation='screen';
    for(const [x,y] of [[210,168],[600,169],[990,168],[205,345],[590,346],[985,346]]){
      const glow=g.createRadialGradient(x,y,8,x+45,y+60,210);
      glow.addColorStop(0,'#a8b9ae1c');glow.addColorStop(1,'#a8b9ae00');
      g.fillStyle=glow;g.fillRect(x-170,y-160,420,420);
    }
    g.restore();
    const shade=g.createLinearGradient(0,0,W,0);shade.addColorStop(0,'#04090977');shade.addColorStop(.14,'#04090900');shade.addColorStop(.86,'#04090900');shade.addColorStop(1,'#04090977');rect(0,0,W,H,shade);
    surface=c;
  }
  return {draw(ctx){if(!surface)paint();ctx.drawImage(surface,0,0)},get floors(){return floors.map(f=>({...f}))}};
})();

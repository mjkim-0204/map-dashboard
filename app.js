// V18 - 전체 재작성
const GRID_CELL=180, GRID_COLS=4, GRID_ROWS=4, STEP=4;
const RADIUS_100=GRID_CELL, RADIUS_150=GRID_CELL*1.5;
const CONST_1=5908.958069, CONST_2=2948754.803, CONST_3=1300233.897;
function areaIndex(r,c){return r*GRID_COLS+c;}

const state={mode:'center',center:null,gridCenter:null,main:[],mainClosed:false,sub:[],subClosed:false,
  arrows:[],arrowStart:null,arrowDragging:null,competitors:[],
  scale:1,mx:0,my:0,isGrab:false,sx:0,sy:0,mapLoaded:false,
  cellStats:Array.from({length:16},()=>({mainPct:0,subPct:0,rawScore:0,finalScore:0}))};

const mapImg=document.getElementById('mapImg'),cvs=document.getElementById('cvs'),ctx=cvs.getContext('2d');
const canvasWrap=document.getElementById('canvasWrap'),canvasHint=document.getElementById('canvasHint');
const zoomSlider=document.getElementById('zoom'),previewCvs=document.getElementById('previewCanvas'),previewCtx=previewCvs.getContext('2d');

function resizeCanvas(){const r=canvasWrap.getBoundingClientRect();cvs.width=r.width;cvs.height=r.height;render();}
window.addEventListener('resize',resizeCanvas);resizeCanvas();

document.getElementById('fileInput').addEventListener('change',function(e){
  const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=ev=>{mapImg.onload=()=>{state.mapLoaded=true;state.mx=0;state.my=0;state.scale=1;zoomSlider.value=1;
    document.getElementById('zoomInput').value='1.00';mapImg.style.display='block';canvasHint.style.display='none';updateTransform();};
    mapImg.src=ev.target.result;};r.readAsDataURL(f);});

zoomSlider.addEventListener('input',function(){state.scale=parseFloat(this.value);updateTransform();});
const zoomInput=document.getElementById('zoomInput');
zoomInput.addEventListener('change',applyZoomInput);
zoomInput.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();applyZoomInput();}});
function applyZoomInput(){const v=parseFloat(zoomInput.value);if(!isNaN(v)&&v>=0.5&&v<=1.2){state.scale=v;zoomSlider.value=v;updateTransform();}}
function updateTransform(){mapImg.style.transform=`translate(${state.mx}px,${state.my}px) scale(${state.scale})`;
  const v=state.scale.toFixed(2);zoomInput.value=v;document.getElementById('st-zoom').textContent=v+'x';render();}

const MODE_LABELS={center:'중심점+반경',grid:'격자 4x4',main:'주동선',sub:'비동선',arrow:'화살표',competitor:'경쟁사'};
const MODE_BTNS={center:'cBtn',grid:'gBtn',main:'mBtn',sub:'sBtn',arrow:'aBtn',competitor:'compBtn'};
function setMode(m){state.mode=m;document.getElementById('st-mode').textContent=MODE_LABELS[m]||m;
  Object.values(MODE_BTNS).forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('btn-active');});
  const b=document.getElementById(MODE_BTNS[m]);if(b)b.classList.add('btn-active');}

// Mouse
cvs.addEventListener('mousedown',function(e){
  const rect=cvs.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
  if(e.button===2){state.isGrab=true;state.sx=e.clientX-state.mx;state.sy=e.clientY-state.my;cvs.style.cursor='grabbing';return;}
  if(state.mode==='center'){state.center={x,y};render();}
  else if(state.mode==='grid'){state.gridCenter={x,y};recalcAll();}
  else if(state.mode==='main'){if(state.mainClosed)return;if(state.main.length>=3&&dist(state.main[0],{x,y})<15)state.mainClosed=true;else state.main.push({x,y});recalcAll();}
  else if(state.mode==='sub'){if(state.subClosed)return;if(state.sub.length>=3&&dist(state.sub[0],{x,y})<15)state.subClosed=true;else state.sub.push({x,y});recalcAll();}
  else if(state.mode==='arrow'){
    const hit=hitTestArrow(x,y);
    if(hit){state.arrowDragging=hit;}
    else if(!state.arrowStart){state.arrowStart={x,y};render();}
    else{state.arrows.push({x1:state.arrowStart.x,y1:state.arrowStart.y,x2:x,y2:y});state.arrowStart=null;render();}
  }
  else if(state.mode==='competitor'){
    const hitIdx=state.competitors.findIndex(c=>dist({x,y},c)<15);
    if(hitIdx>=0){if(confirm('"'+state.competitors[hitIdx].name+'" 삭제?'))state.competitors.splice(hitIdx,1);render();}
    else{const name=prompt('경쟁사 이름:');if(name&&name.trim()){state.competitors.push({x,y,name:name.trim()});render();}}
  }
});
cvs.addEventListener('mousemove',function(e){
  const rect=cvs.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
  if(state.isGrab){state.mx=e.clientX-state.sx;state.my=e.clientY-state.sy;updateTransform();return;}
  if(state.arrowDragging){const d=state.arrowDragging,a=state.arrows[d.idx];
    if(d.handle==='end'){a.x2=x;a.y2=y;}else if(d.handle==='start'){a.x1=x;a.y1=y;}
    else{const dx=x-d.ox,dy=y-d.oy;a.x1+=dx;a.y1+=dy;a.x2+=dx;a.y2+=dy;d.ox=x;d.oy=y;}render();}
});
cvs.addEventListener('mouseup',()=>{state.isGrab=false;state.arrowDragging=null;cvs.style.cursor='crosshair';});
cvs.addEventListener('mouseleave',()=>{state.isGrab=false;state.arrowDragging=null;});
cvs.addEventListener('contextmenu',e=>e.preventDefault());
function hitTestArrow(x,y){for(let i=state.arrows.length-1;i>=0;i--){const a=state.arrows[i];
  if(dist({x,y},{x:a.x2,y:a.y2})<14)return{idx:i,handle:'end',ox:x,oy:y};
  if(dist({x,y},{x:a.x1,y:a.y1})<14)return{idx:i,handle:'start',ox:x,oy:y};
  if(distToSeg({x,y},{x:a.x1,y:a.y1},{x:a.x2,y:a.y2})<12)return{idx:i,handle:'body',ox:x,oy:y};}return null;}
function distToSeg(p,v,w){const l2=(w.x-v.x)**2+(w.y-v.y)**2;if(!l2)return dist(p,v);let t=((p.x-v.x)*(w.x-v.x)+(p.y-v.y)*(w.y-v.y))/l2;t=Math.max(0,Math.min(1,t));return dist(p,{x:v.x+t*(w.x-v.x),y:v.y+t*(w.y-v.y)});}

// Keyboard
window.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();
    if(state.mode==='main'&&state.main.length>0){state.mainClosed=false;state.main.pop();}
    else if(state.mode==='sub'&&state.sub.length>0){state.subClosed=false;state.sub.pop();}
    else if(state.mode==='arrow'&&state.arrows.length>0){state.arrows.pop();state.arrowStart=null;}
    else if(state.mode==='competitor'&&state.competitors.length>0){state.competitors.pop();}
    recalcAll();render();}
  if(e.key==='Enter'){e.preventDefault();if(state.mode==='main'&&state.main.length>=3)state.mainClosed=true;if(state.mode==='sub'&&state.sub.length>=3)state.subClosed=true;recalcAll();render();}
  if(e.key==='Delete'&&state.mode==='arrow'){state.arrows=[];state.arrowStart=null;render();}
});
function clearTrack(t){if(t==='main'){state.main=[];state.mainClosed=false;}if(t==='sub'){state.sub=[];state.subClosed=false;}
  if(t==='arrow'){state.arrows=[];state.arrowStart=null;}if(t==='competitor'){state.competitors=[];}recalcAll();render();}
function clearAll(){state.center=null;state.gridCenter=null;state.main=[];state.mainClosed=false;state.sub=[];state.subClosed=false;state.arrows=[];state.arrowStart=null;state.competitors=[];recalcAll();render();}

// Grid origin: click = left side between A5 and A9 (between row1 and row2, i.e. 2 rows down from top)
function gridOrigin(){if(!state.gridCenter)return null;return{gx:state.gridCenter.x,gy:state.gridCenter.y-GRID_CELL*2};}
function pointInPolygon(x,y,poly){let ins=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i].x,yi=poly[i].y,xj=poly[j].x,yj=poly[j].y;if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins;}return ins;}
function cellPixelSet(r,c){const o=gridOrigin();if(!o)return new Set();const x0=Math.round(o.gx+c*GRID_CELL),y0=Math.round(o.gy+r*GRID_CELL);const s=new Set();for(let py=y0;py<y0+GRID_CELL;py+=STEP)for(let px=x0;px<x0+GRID_CELL;px+=STEP)s.add((px/STEP|0)+','+(py/STEP|0));return s;}
function polyPixelSet(poly,b){if(!poly||poly.length<3)return new Set();const s=new Set();for(let py=b.y0;py<b.y1;py+=STEP)for(let px=b.x0;px<b.x1;px+=STEP)if(pointInPolygon(px,py,poly))s.add((px/STEP|0)+','+(py/STEP|0));return s;}
function polyBBox(p){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;p.forEach(pt=>{x0=Math.min(x0,pt.x);y0=Math.min(y0,pt.y);x1=Math.max(x1,pt.x);y1=Math.max(y1,pt.y);});return{x0:Math.floor(x0),y0:Math.floor(y0),x1:Math.ceil(x1),y1:Math.ceil(y1)};}

function recalcAll(){
  if(!state.gridCenter){state.cellStats=Array.from({length:16},()=>({mainPct:0,subPct:0,rawScore:0,finalScore:0}));renderAnalysis();updateTargetDemand();updateSales();return;}
  let mainSet=new Set(),subSet=new Set();
  if(state.mainClosed&&state.main.length>=3){const b=polyBBox(state.main);mainSet=polyPixelSet(state.main,b);}
  if(state.subClosed&&state.sub.length>=3){const b=polyBBox(state.sub);subSet=polyPixelSet(state.sub,b);}
  const univB=document.getElementById('chk-univ')?.checked?1.43:1.0;
  const compB=document.getElementById('chk-comp')?.checked?0.5:1.0;
  state.cellStats=[];
  for(let r=0;r<GRID_ROWS;r++)for(let c=0;c<GRID_COLS;c++){
    const idx=areaIndex(r,c),cs=cellPixelSet(r,c),tot=cs.size||1;let mc=0,sc=0;
    cs.forEach(k=>{if(mainSet.has(k))mc++;else if(subSet.has(k))sc++;});
    const mp=parseFloat(((mc/tot)*100).toFixed(1)),sp=parseFloat(((sc/tot)*100).toFixed(1));
    const raw=parseFloat((mp*1.0+sp*0.5).toFixed(1));
    const slope=document.getElementById('chk-slope-'+idx)?.checked?0.5:1.0;
    const final=parseFloat((raw*slope*univB*compB).toFixed(1));
    state.cellStats.push({mainPct:mp,subPct:sp,rawScore:raw,finalScore:final});}
  renderAnalysis();render();updateTargetDemand();updateSales();}

function renderAnalysis(){
  const el=document.getElementById('cellStatsTable');if(!el)return;
  const univB=document.getElementById('chk-univ')?.checked?1.43:1.0;
  const compB=document.getElementById('chk-comp')?.checked?0.5:1.0;
  let rows=[],gt=0;
  for(let i=0;i<16;i++){const s=state.cellStats[i],ou=getOU(i),slope=document.getElementById('chk-slope-'+i)?.checked?0.5:1.0;
    const hm=s.mainPct>0,hs=s.subPct>0;
    if(!hm&&!hs){rows.push({i,t:'none',ou,pct:0,slope,res:0,first:true,rs:1});}
    else if(hm&&hs){const mr=Math.round(ou*(s.mainPct/100)*1.0*slope*univB*compB),sr=Math.round(ou*(s.subPct/100)*0.5*slope*univB*compB);gt+=mr+sr;
      rows.push({i,t:'main',ou,pct:s.mainPct,slope,res:mr,first:true,rs:2});rows.push({i,t:'sub',ou,pct:s.subPct,slope,res:sr,first:false,rs:2});}
    else if(hm){const mr=Math.round(ou*(s.mainPct/100)*1.0*slope*univB*compB);gt+=mr;rows.push({i,t:'main',ou,pct:s.mainPct,slope,res:mr,first:true,rs:1});}
    else{const sr=Math.round(ou*(s.subPct/100)*0.5*slope*univB*compB);gt+=sr;rows.push({i,t:'sub',ou,pct:s.subPct,slope,res:sr,first:true,rs:1});}}
  let h='<table class="analysis2-table"><thead><tr><th>구역</th><th>오픈업</th><th>동선%</th><th style="color:#f87171">경사(x0.5)</th><th>계</th></tr></thead><tbody>';
  for(const r of rows){const ic=r.t==='main'?'R':r.t==='sub'?'Y':'';const pc=r.t==='main'?'#ef4444':r.t==='sub'?'#eab308':'#475569';
    const lbl='<td class="a-label">A'+(r.i+1)+' '+ic+'</td>';
    const oc=r.first?'<td rowspan="'+r.rs+'">'+(r.ou>0?r.ou.toLocaleString():'-')+'</td>':'';
    const sc=r.first?'<td rowspan="'+r.rs+'"><label class="slope-chk-wrap"><input type="checkbox" id="chk-slope-'+r.i+'" '+(document.getElementById('chk-slope-'+r.i)?.checked?'checked':'')+' onchange="recalcAll()"></label></td>':'';
    const rv=r.res>0?r.res.toLocaleString():'-';const rc=r.res>0?'a-result':'a-result zero';
    h+='<tr>'+lbl+oc+'<td style="color:'+pc+';font-weight:700">'+(r.pct>0?r.pct+'%':'-')+'</td>'+sc+'<td class="'+rc+'">'+rv+'</td></tr>';}
  h+='</tbody><tfoot><tr><td colspan="4" style="text-align:right;color:#94a3b8;font-size:10px">합계</td><td class="total-result">'+gt.toLocaleString()+'</td></tr></tfoot></table>';
  el.innerHTML=h;}

// Render
function render(){
  ctx.clearRect(0,0,cvs.width,cvs.height);
  // Polygons (main=red 45%, sub=orange 45%, stroke=black)
  drawPoly(state.sub,'rgba(255,192,0,0.30)','#000',state.subClosed);
  drawPoly(state.main,'rgba(255,0,0,0.30)','#000',state.mainClosed);
  // Center + radius
  if(state.center){const{x,y}=state.center;
    ctx.beginPath();ctx.arc(x,y,RADIUS_100,0,Math.PI*2);ctx.strokeStyle='#000';ctx.lineWidth=3;ctx.setLineDash([]);ctx.stroke();
    ctx.fillStyle='#000';ctx.font='bold 11px Malgun Gothic';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText('100m',x+RADIUS_100+4,y);
    ctx.beginPath();ctx.arc(x,y,RADIUS_150,0,Math.PI*2);ctx.strokeStyle='#ef4444';ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle='#ef4444';ctx.fillText('150m',x+RADIUS_150+4,y);
    ctx.setLineDash([3,3]);ctx.strokeStyle='rgba(239,68,68,.6)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(x-20,y);ctx.lineTo(x+20,y);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y-20);ctx.lineTo(x,y+20);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fillStyle='#ef4444';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();}
  // Grid
  if(state.gridCenter){const o=gridOrigin(),gx=o.gx,gy=o.gy;
    for(let r=0;r<GRID_ROWS;r++)for(let c=0;c<GRID_COLS;c++){
      const idx=areaIndex(r,c),cx=gx+c*GRID_CELL,cy=gy+r*GRID_CELL;
      // 셀 면 (살짝 보이는 반투명)
      ctx.fillStyle='rgba(200,210,230,0.08)';ctx.fillRect(cx,cy,GRID_CELL,GRID_CELL);
      // 셀 구분선 (투명하지만 면 구분 가능)
      ctx.strokeStyle='rgba(255,255,255,0.15)';ctx.lineWidth=1;ctx.strokeRect(cx,cy,GRID_CELL,GRID_CELL);
      // 셀 번호
      ctx.fillStyle='rgba(248,250,252,.85)';ctx.font='bold 12px Malgun Gothic';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText('A'+(idx+1),cx+4,cy+3);
      const ou=getOU(idx);if(ou>0){ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='rgba(255,255,255,.9)';ctx.shadowBlur=5;ctx.fillStyle='#0f172a';ctx.font='bold 31px Malgun Gothic';ctx.fillText(ou.toLocaleString(),cx+GRID_CELL/2,cy+GRID_CELL/2);ctx.shadowBlur=0;}}
    // Grid origin marker
    ctx.beginPath();ctx.arc(state.gridCenter.x,state.gridCenter.y,7,0,Math.PI*2);ctx.fillStyle='#3b82f6';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();}
  // Arrows
  if(state.arrowStart){ctx.beginPath();ctx.arc(state.arrowStart.x,state.arrowStart.y,6,0,Math.PI*2);ctx.fillStyle='#6b7280';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();}
  state.arrows.forEach(a=>{const dx=a.x2-a.x1,dy=a.y2-a.y1,len=Math.sqrt(dx*dx+dy*dy);if(len<5)return;const ang=Math.atan2(dy,dx);
    ctx.beginPath();ctx.moveTo(a.x1,a.y1);ctx.lineTo(a.x2,a.y2);ctx.strokeStyle='rgba(107,114,128,0.50)';ctx.lineWidth=20;ctx.lineCap='round';ctx.setLineDash([]);ctx.stroke();
    const hs=30,tx=a.x2+10*Math.cos(ang),ty2=a.y2+10*Math.sin(ang);
    ctx.beginPath();ctx.moveTo(tx-hs*Math.cos(ang-.5),ty2-hs*Math.sin(ang-.5));ctx.lineTo(tx,ty2);ctx.lineTo(tx-hs*Math.cos(ang+.5),ty2-hs*Math.sin(ang+.5));
    ctx.strokeStyle='rgba(107,114,128,.7)';ctx.lineWidth=6;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
    ctx.beginPath();ctx.arc(a.x1,a.y1,6,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#6b7280';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.arc(a.x2,a.y2,6,0,Math.PI*2);ctx.fillStyle='#6b7280';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();});
  // Competitors
  state.competitors.forEach(c=>{ctx.beginPath();ctx.arc(c.x,c.y,7,0,Math.PI*2);ctx.fillStyle='#ef4444';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
    ctx.font='bold 12px Malgun Gothic';ctx.textAlign='center';ctx.textBaseline='top';const tw=ctx.measureText(c.name).width;
    ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillRect(c.x-tw/2-3,c.y+10,tw+6,15);ctx.fillStyle='#000';ctx.fillText(c.name,c.x,c.y+12);});}

function drawPoly(pts,fill,stroke,closed){if(pts.length<1)return;ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=2.5;ctx.setLineDash([]);
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
  if(closed&&pts.length>2){ctx.closePath();ctx.fill();}ctx.stroke();
  pts.forEach(pt=>{ctx.beginPath();ctx.arc(pt.x,pt.y,4,0,Math.PI*2);ctx.fillStyle=stroke;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();});}
function dist(a,b){return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);}

// Tabs
function switchTab(name){document.querySelectorAll('.tab-btn').forEach((b,i)=>{b.classList.toggle('active',['data','analysis','preview','export'][i]===name);});
  document.querySelectorAll('.tab-content').forEach(el=>{el.classList.toggle('active',el.id==='tab-'+name);});}

// Target demand
function onRatioChange(){updateTargetDemand();}
function onBonusChange(){recalcAll();}
function updateTargetDemand(){const gtRaw=calcGTraw();const bgEl=document.getElementById('d_bg');if(bgEl)bgEl.textContent=gtRaw.toLocaleString();
  const ids=['d_m20','d_m30','d_f20','d_f30'];let sum=0;ids.forEach(id=>{const el=document.getElementById(id);if(el)sum+=parseFloat(el.value)||0;});
  const rEl=document.getElementById('d_ratio');if(rEl)rEl.textContent=sum.toFixed(1)+'%';
  const tEl=document.getElementById('d_total');if(tEl)tEl.textContent=sum.toFixed(1)+'%';
  const rawTarget=Math.round(gtRaw*sum/100);
  const isUniv=document.getElementById('chk-univ')?.checked;
  const finalTarget=isUniv?Math.round(rawTarget*1.43):rawTarget;
  const tvEl=document.getElementById('d_target');
  if(tvEl){
    if(isUniv&&finalTarget>0){tvEl.textContent=rawTarget.toLocaleString()+'*1.43\n='+finalTarget.toLocaleString()+'명';}
    else tvEl.textContent=finalTarget>0?finalTarget.toLocaleString()+'명':'0명';}
  updateSales();}
// calcGT without univ bonus
function calcGTraw(){if(!state.gridCenter)return 0;const cB=document.getElementById('chk-comp')?.checked?0.5:1;let t=0;
  for(let i=0;i<16;i++){const s=state.cellStats[i],ou=getOU(i),sl=document.getElementById('chk-slope-'+i)?.checked?0.5:1;
    if(s.mainPct>0)t+=ou*(s.mainPct/100)*1*sl*cB;if(s.subPct>0)t+=ou*(s.subPct/100)*0.5*sl*cB;}return Math.round(t);}
function calcGT(){return calcGTraw();} // kept for compatibility
function updateSales(){const tEl=document.getElementById('d_target');
  let txt=tEl?.textContent||'0';
  // "103*1.43\n=150명" 형태면 = 뒤의 숫자만, 아니면 전체에서 숫자 추출
  if(txt.includes('=')){txt=txt.split('=').pop();}
  const tv=parseInt(txt.replace(/[^0-9]/g,''))||0;
  if(!tv){['d_avg_sales','d_hi_sales','d_lo_sales'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});return;}
  const avg=Math.round(tv*CONST_1+CONST_2),hi=Math.round(tv*CONST_1+CONST_2+CONST_3),lo=Math.round(tv*CONST_1+CONST_2-CONST_3);
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v.toLocaleString();};s('d_avg_sales',avg);s('d_hi_sales',hi);s('d_lo_sales',lo);}

// OpenUp grid
function initOU(){const tb=document.getElementById('openupGridBody');if(!tb)return;let h='';
  for(let r=0;r<GRID_ROWS;r++){h+='<tr>';for(let c=0;c<GRID_COLS;c++){const i=areaIndex(r,c);h+='<td><div class="area-label">A'+(i+1)+'</div><input class="openup-input" id="ou-'+i+'" type="text" placeholder="0" oninput="recalcAll()"></td>';}h+='</tr>';}tb.innerHTML=h;}
function getOU(i){const e=document.getElementById('ou-'+i);if(!e||!e.value.trim())return 0;return parseFloat(e.value.replace(/,/g,''))||0;}

// Data collection
function getData(){const g=id=>document.getElementById(id)?.value?.trim()??'';const gt=id=>document.getElementById(id)?.textContent?.trim()??'';
  const rs=['d_m20','d_m30','d_f20','d_f30'].reduce((s,id)=>s+(parseFloat(document.getElementById(id)?.value)||0),0);
  const dep=g('d_deposit'),rent=g('d_rent'),prem=g('d_premium');
  return{addr:g('addr'),deposit:dep?(dep+'만원'):'',rent:rent?(rent+'만원'):'',premium:prem?(prem+'만원'):'',
    bg:gt('d_bg'),ratio:rs.toFixed(1)+'%',target:gt('d_target'),
    m20:(parseFloat(g('d_m20'))||0).toFixed(1)+'%',m30:(parseFloat(g('d_m30'))||0).toFixed(1)+'%',f20:(parseFloat(g('d_f20'))||0).toFixed(1)+'%',f30:(parseFloat(g('d_f30'))||0).toFixed(1)+'%',total:rs.toFixed(1)+'%',
    avgSales:g('d_avg_sales'),avgDirect:g('d_avg_direct'),avgFran:g('d_avg_fran'),
    hiSales:g('d_hi_sales'),hiDirect:g('d_hi_direct'),hiFran:g('d_hi_fran'),
    loSales:g('d_lo_sales'),loDirect:g('d_lo_direct'),loFran:g('d_lo_fran')};}

// Preview (matches PPT layout)
function generatePreview(){const d=getData();const W=1200,H=675;previewCvs.width=W;previewCvs.height=H;previewCvs.style.width='100%';
  const px=W/33.867;const pCtx=previewCtx;pCtx.fillStyle='#fff';pCtx.fillRect(0,0,W,H);
  // Map
  if(state.mapLoaded){
    const imgW2=mapImg.naturalWidth*state.scale,imgH2=mapImg.naturalHeight*state.scale;
    const vx=Math.max(0,state.mx),vy=Math.max(0,state.my);
    const vr=Math.min(cvs.width,state.mx+imgW2),vb=Math.min(cvs.height,state.my+imgH2);
    const cw2=vr-vx,ch2=vb-vy;
    const tmp=document.createElement('canvas');tmp.width=cw2>0?cw2:cvs.width;tmp.height=ch2>0?ch2:cvs.height;const tc=tmp.getContext('2d');
    tc.fillStyle='#ffffff';tc.fillRect(0,0,tmp.width,tmp.height);
    tc.save();tc.translate(state.mx-vx,state.my-vy);tc.scale(state.scale,state.scale);tc.drawImage(mapImg,0,0);tc.restore();
    tc.drawImage(cvs,vx,vy,tmp.width,tmp.height,0,0,tmp.width,tmp.height);
    const maxW=(33.867-10.3-0.75-0.5)*px,maxH=(19.05-1.5)*px;const ratio2=tmp.width/tmp.height;let dw=maxW,dh=dw/ratio2;if(dh>maxH){dh=maxH;dw=dh*ratio2;}
    pCtx.drawImage(tmp,0.75*px,1.5*px,dw,dh);}
  // Tables
  const rx=(33.867-10.3+0.5)*px,rw=(10.3-1)*px;let ty=1*px;
  pCtx.fillStyle='#1e293b';pCtx.font='bold 14px Malgun Gothic';pCtx.textAlign='left';pCtx.textBaseline='top';
  const al=d.addr;if(al.length>28){pCtx.fillText(al.slice(0,28),rx,ty);pCtx.fillText(al.slice(28),rx,ty+16);}else pCtx.fillText(al,rx,ty);
  ty+=38+0.5*px;
  function tbl(title,hdrs,data,hl){pCtx.fillStyle='#1e293b';pCtx.font='bold 11px Malgun Gothic';pCtx.textAlign='left';pCtx.fillText(title,rx,ty);ty+=14;
    const cols=hdrs.length,cw2=rw/cols,rh=20;
    for(let c=0;c<cols;c++){pCtx.fillStyle='#d9d9d9';pCtx.fillRect(rx+c*cw2,ty,cw2,rh);pCtx.strokeStyle='#000';pCtx.lineWidth=.5;pCtx.strokeRect(rx+c*cw2,ty,cw2,rh);
      pCtx.fillStyle='#000';pCtx.font='bold 9px Malgun Gothic';pCtx.textAlign='center';pCtx.textBaseline='middle';pCtx.fillText(hdrs[c],rx+c*cw2+cw2/2,ty+rh/2);}ty+=rh;
    for(let r=0;r<data.length;r++){for(let c=0;c<cols;c++){pCtx.fillStyle='#fff';pCtx.fillRect(rx+c*cw2,ty,cw2,rh);pCtx.strokeStyle='#000';pCtx.lineWidth=.5;pCtx.strokeRect(rx+c*cw2,ty,cw2,rh);
      pCtx.fillStyle='#000';pCtx.font='9px Malgun Gothic';pCtx.textAlign='center';pCtx.textBaseline='middle';
      const txt=String(data[r][c]||'');if(hl&&hl.some(h2=>h2[0]===r&&h2[1]===c)){pCtx.save();pCtx.fillStyle='#FFFF00';const tw2=pCtx.measureText(txt).width;pCtx.fillRect(rx+c*cw2+cw2/2-tw2/2-1,ty+rh/2-6,tw2+2,12);pCtx.restore();pCtx.fillStyle='#000';}
      pCtx.fillText(txt,rx+c*cw2+cw2/2,ty+rh/2);}ty+=rh;}ty+=10;}
  tbl('임차조건',['보증금','월세(관리비)','권리금'],[[d.deposit,d.rent,d.premium]]);
  tbl('타겟수요',['배후수요','타겟비율','타겟수요(명)'],[[d.bg,d.ratio,d.target]],[[0,2]]);
  tbl('타겟비율',['남20','남30','여20','여30','합계'],[[d.m20,d.m30,d.f20,d.f30,d.total]]);
  tbl('예상매출액 및 월별 IRR',['','예상매출액','직영','가맹'],[['평균',d.avgSales,d.avgDirect,d.avgFran],['상한',d.hiSales,d.hiDirect,d.hiFran],['하한',d.loSales,d.loDirect,d.loFran]],[[0,1],[0,2],[0,3]]);
  switchTab('preview');}

// Exports
function exportPNG(){if(!previewCvs.width)return alert('미리보기를 먼저 생성하세요');const a=document.createElement('a');a.download='slide_'+new Date().toISOString().slice(0,10)+'.png';a.href=previewCvs.toDataURL('image/png');a.click();}
function exportMapOnly(){if(!state.mapLoaded)return alert('지도를 먼저 불러오세요');const iw=mapImg.naturalWidth*state.scale,ih=mapImg.naturalHeight*state.scale;const cw=Math.min(iw,cvs.width),ch=Math.min(ih,cvs.height);
  const tmp=document.createElement('canvas');tmp.width=cw;tmp.height=ch;const tc=tmp.getContext('2d');tc.save();tc.translate(state.mx,state.my);tc.scale(state.scale,state.scale);tc.drawImage(mapImg,0,0);tc.restore();tc.drawImage(cvs,0,0,cw,ch,0,0,cw,ch);
  const a=document.createElement('a');a.download='map_'+new Date().toISOString().slice(0,10)+'.png';a.href=tmp.toDataURL('image/png');a.click();}
function exportToGoogleSlide(){const url=document.getElementById('gslide-url')?.value?.trim();if(!url)return alert('URL을 입력하세요');if(!url.includes('docs.google.com/presentation'))return alert('유효한 구글 슬라이드 URL이 아닙니다');alert('구글 슬라이드 연동은 OAuth 설정 후 사용 가능합니다.\nURL: '+url);}

// PPT Export (widescreen 33.867x19.05cm)
function exportPPT(){if(!state.mapLoaded)return alert('지도를 먼저 불러오세요');const d=getData();
  const pptW=33.867,pptH=19.05,tableW=10.3;const pptx=new PptxGenJS();
  pptx.defineLayout({name:'W',width:pptW/2.54,height:pptH/2.54});pptx.layout='W';const slide=pptx.addSlide();
  // Map image (capture only the visible image area, not empty canvas)
  const imgW=mapImg.naturalWidth*state.scale, imgH=mapImg.naturalHeight*state.scale;
  // 이미지가 보이는 영역 계산 (캔버스 내에서 이미지가 차지하는 부분)
  const visX=Math.max(0,state.mx), visY=Math.max(0,state.my);
  const visR=Math.min(cvs.width, state.mx+imgW), visB=Math.min(cvs.height, state.my+imgH);
  const capW=visR-visX, capH=visB-visY;
  const tmp=document.createElement('canvas');tmp.width=capW>0?capW:cvs.width;tmp.height=capH>0?capH:cvs.height;const tc=tmp.getContext('2d');
  tc.fillStyle='#ffffff';tc.fillRect(0,0,tmp.width,tmp.height);
  tc.save();tc.translate(state.mx-visX,state.my-visY);tc.scale(state.scale,state.scale);tc.drawImage(mapImg,0,0);tc.restore();
  // overlay (격자, 동선 등) — 같은 오프셋으로
  tc.drawImage(cvs,visX,visY,tmp.width,tmp.height,0,0,tmp.width,tmp.height);
  const mapData=tmp.toDataURL('image/png');
  const mxCm=0.75,myCm=1.5,availW=(pptW-tableW-mxCm-0.5)*0.9/2.54,availH=(pptH-myCm)*0.9/2.54;
  const ratio=tmp.width/tmp.height;let mw=availW,mh=mw/ratio;if(mh>availH){mh=availH;mw=mh*ratio;}
  slide.addImage({data:mapData,x:mxCm/2.54,y:myCm/2.54,w:mw,h:mh});
  // Table area
  const tmL=0.5/2.54,tmR=0.75/2.54;const rx=mw+mxCm/2.54+tmL;const rw=pptW/2.54-rx-tmR;
  // Title
  slide.addText(d.addr,{x:rx,y:myCm/2.54,w:rw,h:.8,fontSize:18,bold:true,fontFace:'Malgun Gothic',color:'1e293b',valign:'top',wrap:true});
  let ty=myCm/2.54+.85+.5/2.54;const fs=12,stH=.22,tGap=.12;
  function sub(t){ty+=.08;slide.addText(t,{x:rx,y:ty,w:rw,h:stH,fontSize:12,bold:true,fontFace:'Malgun Gothic',color:'1e293b',valign:'bottom',wrap:false});ty+=stH;}
  function tbl(hdrs,data,hl){const cols=hdrs.length,cws=Array(cols).fill(rw/cols);
    // 데이터에 줄바꿈 있으면 행 높이 키움
    let dataRowH=.3;
    data.forEach(row=>row.forEach(cell=>{if(String(cell||'').includes('\n'))dataRowH=.45;}));
    const rows=[hdrs.map(h=>({text:h,options:{bold:true,fill:'D9D9D9'}})),...data.map((row,ri)=>row.map((cell,ci)=>{
      const opt={};if(hl&&hl.some(h2=>h2[0]===ri&&h2[1]===ci)){opt.highlight='FFFF00';opt.bold=true;}return{text:String(cell||''),options:opt};}))];
    slide.addTable(rows,{x:rx,y:ty,w:rw,fontSize:fs,fontFace:'Malgun Gothic',border:{type:'solid',pt:.5,color:'000000'},colW:cws,align:'center',valign:'middle'});
    ty+=.28+dataRowH*data.length+.15;}
  sub('※ 임차조건');tbl(['보증금','월세(관리비)','권리금'],[[d.deposit,d.rent,d.premium]]);
  sub('※ 타겟수요');tbl(['배후수요','타겟비율','타겟수요(명)'],[[d.bg,d.ratio,d.target]],[[0,2]]);
  sub('※ 타겟비율');tbl(['남20','남30','여20','여30','합계'],[[d.m20,d.m30,d.f20,d.f30,d.total]]);
  sub('※ 매출 및 IRR');
  // 매출 표는 평균행 볼드 처리를 위해 직접 구성
  const irrHdrs=[{text:'',options:{bold:true,fill:'D9D9D9'}},{text:'예상매출액',options:{bold:true,fill:'D9D9D9'}},{text:'직영',options:{bold:true,fill:'D9D9D9'}},{text:'가맹',options:{bold:true,fill:'D9D9D9'}}];
  const irrData=[
    [{text:'평균',options:{bold:true}},{text:String(d.avgSales||''),options:{bold:true,highlight:'FFFF00'}},{text:String(d.avgDirect||''),options:{bold:true,highlight:'FFFF00'}},{text:String(d.avgFran||''),options:{bold:true,highlight:'FFFF00'}}],
    [{text:'상한'},{text:String(d.hiSales||'')},{text:String(d.hiDirect||'')},{text:String(d.hiFran||'')}],
    [{text:'하한'},{text:String(d.loSales||'')},{text:String(d.loDirect||'')},{text:String(d.loFran||'')}]];
  const irrRows=[irrHdrs,...irrData];const irrCws=[rw*0.15,rw*0.35,rw*0.25,rw*0.25];
  slide.addTable(irrRows,{x:rx,y:ty,w:rw,fontSize:fs,fontFace:'Malgun Gothic',border:{type:'solid',pt:.5,color:'000000'},colW:irrCws,align:'center',valign:'middle'});
  ty+=.28+.3*irrData.length+.15;
  pptx.writeFile({fileName:(d.addr||'분석')+'_'+new Date().toISOString().slice(0,10)+'.pptx'});}

// Init
window.addEventListener('DOMContentLoaded',function(){initOU();updateTargetDemand();});

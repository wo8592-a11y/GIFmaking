(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const upload = $("#editor-upload"), input=$("#editor-file"), workspace=$("#editor-workspace");
  let sourceFile=null, sourceInfo=null, frames=[], edited=null, currentTool="resize", locked=true, busy=false;
  let settings={scaleX:100,scaleY:100,rotate:0,flipX:false,flipY:false,speed:1,reverse:false,filter:"none",invert:false,start:0,end:100};
  const toolNames={resize:"Resize",crop:"Crop",downsize:"Downsizing",format:"Format Convert",rotate:"Rotate",optimize:"Optimize",reverse:"Reverse",speed:"Speed",cut:"Cut",effects:"Filter & Color",sticker:"Sticker",text:"Text"};
  function bytes(n){if(n<1024)return n+" B";let v=n/1024,u="KB";if(v>=1024){v/=1024;u="MB"}return v.toFixed(2)+" "+u}
  function message(t,bad=true){$("#editor-upload-message").textContent=t;$("#editor-upload-message").style.color=bad?"#b42318":"#08734f"}
  async function decode(file){
    if(typeof ImageDecoder!=="function")throw Error("이 브라우저는 GIF 프레임 편집을 지원하지 않습니다. 최신 Chrome 또는 Edge를 이용해 주세요.");
    const dec=new ImageDecoder({data:await file.arrayBuffer(),type:"image/gif"});await dec.tracks.ready;
    const track=dec.tracks.selectedTrack;if(!track)throw Error("GIF 프레임을 읽을 수 없습니다.");
    const out=[];let w=0,h=0;
    for(let i=0;i<track.frameCount;i++){
      const d=await dec.decode({frameIndex:i});const im=d.image;w=im.displayWidth;h=im.displayHeight;
      const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(im,0,0);out.push({canvas:c,delay:Math.max(20,im.duration?im.duration/1000:100)});im.close();
    }
    dec.close();return {frames:out,width:w,height:h};
  }
  function infoHtml(file,info){return [["파일명",file.name],["용량",bytes(file.size)],["해상도",info.width+" × "+info.height],["프레임",info.frames.length+"장"],["재생 시간",(info.frames.reduce((a,f)=>a+f.delay,0)/1000).toFixed(2)+"초"]].map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}
  function accept(file){
    if(!file)return;if(!(file.type==="image/gif"||/\.gif$/i.test(file.name))){message("GIF 형식이 아닙니다. 편집 가능한 파일 형식은 GIF(.gif)입니다. GIF 파일을 선택해 주세요.");return}
    message("GIF를 불러오는 중입니다.",false);
    decode(file).then(info=>{
      sourceFile=file;sourceInfo=info;frames=info.frames;edited=null;settings.scaleX=info.width;settings.scaleY=info.height;
      $("#editor-original").src=URL.createObjectURL(file);$("#original-info").innerHTML=infoHtml(file,info);
      $("#editor-save-name").value=file.name.replace(/\.gif$/i,"")+"_ed.gif";
      $("#result-panel").hidden=true;$("#editor-upload").hidden=true;workspace.hidden=false;
      $("#original-body").hidden=false;$("#toggle-original").textContent="−";renderTool("resize");
    }).catch(e=>message(e.message||"GIF를 읽지 못했습니다."));
  }
  $("#editor-browse").onclick=()=>input.click();
  input.onchange=()=>{if(input.files.length)accept(input.files[0]);input.value=""};
  ["dragenter","dragover"].forEach(ev=>upload.addEventListener(ev,e=>{e.preventDefault();upload.classList.add("is-over")}));
  ["dragleave","drop"].forEach(ev=>upload.addEventListener(ev,e=>{e.preventDefault();upload.classList.remove("is-over")}));
  upload.addEventListener("drop",e=>{const f=[...e.dataTransfer.files];if(f.length!==1){message("한 번에 GIF 파일 하나만 선택할 수 있습니다.");return}accept(f[0])});
  $("#toggle-original").onclick=()=>{$("#original-body").hidden=!$("#original-body").hidden;$("#toggle-original").textContent=$("#original-body").hidden?"+":"−"};
  $("#editor-reset").onclick=()=>{sourceFile=null;frames=[];edited=null;workspace.hidden=true;upload.hidden=false;$("#editor-result").removeAttribute("src");message("")};
  $("#editor-tool-menu").addEventListener("click",e=>{const b=e.target.closest("[data-tool]");if(b)renderTool(b.dataset.tool)});
  function range(label,key,min,max,val,unit=""){return `<label class="field">${label}<output id="out-${key}">${val}${unit}</output><input type="range" id="ctl-${key}" min="${min}" max="${max}" value="${val}"></label>`}
  function panelButtons(){return `<div class="tool-actions"><button class="btn btn--ghost" data-back type="button">Back</button><button class="btn" data-go type="button">Go!</button></div>`}
  function renderTool(tool){
    currentTool=tool;$("#editor-tool-menu").querySelectorAll("button").forEach(b=>b.classList.toggle("is-active",b.dataset.tool===tool));
    let h=`<h4>${toolNames[tool]}</h4>`;
    if(tool==="resize"){
      h+=`<p class="tool-note">원본 ${sourceInfo.width} × ${sourceInfo.height}px · 축별 5%–300%</p>
      ${range("X축 너비","sx",Math.max(1,Math.round(sourceInfo.width*.05)),Math.round(sourceInfo.width*3),settings.scaleX,"px")}
      <div class="lock-row"><span>↔ X</span><button id="ratio-lock" type="button" title="비율 잠금">${locked?"🔒":"🔓"}</button><span>Y ↕</span></div>
      ${range("Y축 높이","sy",Math.max(1,Math.round(sourceInfo.height*.05)),Math.round(sourceInfo.height*3),settings.scaleY,"px")}${panelButtons()}`;
    } else if(tool==="rotate") h+=`<label class="field">회전<select id="rot"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label><label class="check"><input id="flipx" type="checkbox"> 좌우 뒤집기</label><label class="check"><input id="flipy" type="checkbox"> 상하 뒤집기</label>${panelButtons()}`;
    else if(tool==="reverse")h+=`<p>애니메이션 프레임 순서를 반대로 재생합니다.</p>${panelButtons()}`;
    else if(tool==="speed")h+=`<label class="field">재생 속도<select id="speed"><option value=".25">0.25배</option><option value=".5">0.5배</option><option value=".75">0.75배</option><option value="1" selected>1배</option><option value="1.25">1.25배</option><option value="1.5">1.5배</option><option value="2">2배</option><option value="3">3배</option></select></label>${panelButtons()}`;
    else if(tool==="cut")h+=`${range("시작 지점 (%)","start",0,99,0,"%")}${range("종료 지점 (%)","end",1,100,100,"%")}<p class="tool-note">선택한 구간만 새 GIF로 저장합니다.</p>${panelButtons()}`;
    else if(tool==="downsize")h+=`<p>용량을 줄일 방법을 선택하세요.</p><label class="check"><input type="checkbox" id="ds-size" checked> 가로·세로 크기 축소 (75%)</label><label class="check"><input type="checkbox" id="ds-frames"> 프레임 수 줄이기 (절반)</label><label class="check"><input type="checkbox" id="ds-colors"> 색상 수 줄이기</label>${panelButtons()}`;
    else if(tool==="crop")h+=`<label class="field">비율<select id="crop-ratio"><option value="1">1:1</option><option value="1.333">4:3</option><option value="1.777">16:9</option><option value="0.75">3:4</option><option value="source">원본 비율</option></select></label><label class="field">빈 공간 처리<select id="crop-fill"><option value="cover">이미지 확대해 채우기</option><option value="white">흰색으로 채우기</option><option value="black">검정으로 채우기</option></select></label>${panelButtons()}`;
    else if(tool==="format")h+=`<label class="field">변환 형식<select id="convert-format"><option value="jpg">JPG (첫 프레임)</option><option value="mp4">MP4 동영상</option></select></label><p class="tool-note">JPG는 대표 프레임으로 저장됩니다. MP4는 브라우저의 MediaRecorder 지원 여부에 따라 처리됩니다.</p>${panelButtons()}`;
    else if(tool==="optimize")h+=`<p>프레임을 다시 인코딩해 팔레트와 불필요한 데이터를 최적화합니다. 원본보다 용량이 커질 수도 있습니다.</p>${panelButtons()}`;
    else if(tool==="effects")h+=`<label class="field">필터<select id="filter"><option value="none">원본</option><option value="grayscale(1)">흑백</option><option value="sepia(1)">세피아</option><option value="contrast(1.35) saturate(1.2)">선명하게</option><option value="blur(1px)">부드럽게</option></select></label><label class="check"><input type="checkbox" id="invert"> 색상 반전</label>${panelButtons()}`;
    else if(tool==="sticker")h+=`<label class="field">스티커 / 이모티콘<input id="sticker" type="text" value="✨" maxlength="8"></label>${range("크기","sticker-size",5,60,18,"%")}${range("표시 시작","sticker-start",0,99,0,"%")}${range("표시 종료","sticker-end",1,100,100,"%")}${range("가로 위치","sticker-x",0,100,50,"%")}${range("세로 위치","sticker-y",0,100,50,"%")}<p class="tool-note">위치 슬라이더로 스티커를 원하는 곳에 배치합니다.</p>${panelButtons()}`;
    else if(tool==="text")h+=`<label class="field">텍스트<input id="overlay-text" type="text" placeholder="GIF에 넣을 문구"></label><label class="field">글자 색상<input id="text-color" type="color" value="#ffffff"></label>${range("글자 크기","text-size",8,80,28,"px")}${range("표시 시작","text-start",0,99,0,"%")}${range("표시 종료","text-end",1,100,100,"%")}${range("가로 위치","text-x",0,100,50,"%")}${range("세로 위치","text-y",0,100,88,"%")}<p class="tool-note">텍스트를 추가하고 표시 구간과 위치를 조정할 수 있습니다.</p>${panelButtons()}`;
    $("#editor-tool-panel").innerHTML=h;
    const bindRange=(key,fn)=>{const el=$("#ctl-"+key);if(el)el.oninput=()=>{const o=$("#out-"+key);if(o)o.textContent=el.value+((key==="text-size"||key==="sx"||key==="sy")?"px":"%");fn(Number(el.value))}};
    if(tool==="resize"){
      $("#ratio-lock").onclick=()=>{locked=!locked;$("#ratio-lock").textContent=locked?"🔒":"🔓"};
      bindRange("sx",v=>{settings.scaleX=v;if(locked){settings.scaleY=Math.max(1,Math.round(v*sourceInfo.height/sourceInfo.width));$("#ctl-sy").value=settings.scaleY;$("#out-sy").textContent=settings.scaleY+"px"}});bindRange("sy",v=>{settings.scaleY=v;if(locked){settings.scaleX=Math.max(1,Math.round(v*sourceInfo.width/sourceInfo.height));$("#ctl-sx").value=settings.scaleX;$("#out-sx").textContent=settings.scaleX+"px"}});
    }
    if(tool==="rotate"){$("#rot").value=settings.rotate;$("#rot").onchange=e=>settings.rotate=Number(e.target.value);$("#flipx").checked=settings.flipX;$("#flipx").onchange=e=>settings.flipX=e.target.checked;$("#flipy").checked=settings.flipY;$("#flipy").onchange=e=>settings.flipY=e.target.checked}
    if(tool==="speed"){$("#speed").value=settings.speed;$("#speed").onchange=e=>settings.speed=Number(e.target.value)}
    if(tool==="reverse"){}
    if(tool==="cut"){bindRange("start",v=>settings.start=v);bindRange("end",v=>settings.end=v)}
    if(tool==="effects"){$("#filter").value=settings.filter;$("#filter").onchange=e=>settings.filter=e.target.value;$("#invert").checked=settings.invert;$("#invert").onchange=e=>settings.invert=e.target.checked}
    if(tool==="sticker"){bindRange("sticker-size",()=>{});bindRange("sticker-start",()=>{});bindRange("sticker-end",()=>{})}
    if(tool==="text"){bindRange("text-size",()=>{});bindRange("text-start",()=>{});bindRange("text-end",()=>{})}
    const back=$("[data-back]",$("#editor-tool-panel"));if(back)back.onclick=()=>{renderTool("resize");$("#editor-tool-menu").querySelectorAll("button").forEach(b=>b.classList.remove("is-active"))};
    const go=$("[data-go]",$("#editor-tool-panel"));if(go)go.onclick=()=>apply(tool);
  }
  async function encode(list,w,h,delayScale=1,colors=128){
    const enc=exports.GIFEncoder();for(let i=0;i<list.length;i++){const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(list[i].canvas,0,0,w,h);
      const data=ctx.getImageData(0,0,w,h).data,pal=exports.quantize(data,colors,{format:"rgb565"}),idx=exports.applyPalette(data,pal,"rgb565");
      enc.writeFrame(idx,w,h,{palette:pal,delay:Math.max(2,Math.round(list[i].delay*delayScale)),repeat:i===0?0:0});if(i%8===0)await new Promise(r=>setTimeout(r,0))}
    enc.finish();return new Blob([enc.bytes()],{type:"image/gif"});
  }
  async function apply(tool){
    if(busy)return;busy=true;const go=$("[data-go]",$("#editor-tool-panel"));if(go){go.disabled=true;go.textContent="처리 중…"}
    try{
      if(tool==="format"){const fmt=$("#convert-format").value;if(fmt==="jpg"){const c=frames[0].canvas;const b=await new Promise(r=>c.toBlob(r,"image/jpeg",.92));showResult(b,"jpg","Converted JPG",c.width,c.height);return}else{await convertMp4();return}}
      let list=frames.map(f=>({canvas:f.canvas,delay:f.delay}));let w=sourceInfo.width,h=sourceInfo.height,delayScale=1,colors=128;
      if(tool==="resize"){w=Math.max(2,Math.round(settings.scaleX));h=Math.max(2,Math.round(settings.scaleY))}
      if(tool==="rotate"&&(settings.rotate===90||settings.rotate===270)){[w,h]=[h,w]}
      if(tool==="reverse")list.reverse();
      if(tool==="speed")delayScale=1/settings.speed;
      if(tool==="cut"){const a=Math.floor(list.length*settings.start/100),b=Math.max(a+1,Math.ceil(list.length*settings.end/100));list=list.slice(a,b)}
      if(tool==="downsize"){if($("#ds-frames").checked)list=list.filter((f,i)=>i%2===0);if($("#ds-size").checked){w=Math.max(2,Math.round(w*.75));h=Math.max(2,Math.round(h*.75))}if($("#ds-colors").checked)colors=48}
      if(tool==="crop"){const ratio=$("#crop-ratio").value==="source"?w/h:Number($("#crop-ratio").value);if(w/h>ratio)w=Math.round(h*ratio);else h=Math.round(w/ratio)}
      const sticker=tool==="sticker"?$("#sticker").value:"",stSize=tool==="sticker"?Number($("#ctl-sticker-size").value)/100:0;
      const text=tool==="text"?$("#overlay-text").value:"",textSize=tool==="text"?Number($("#ctl-text-size").value):0;
      const startPct=tool==="sticker"?Number($("#ctl-sticker-start").value):tool==="text"?Number($("#ctl-text-start").value):0;
      const endPct=tool==="sticker"?Number($("#ctl-sticker-end").value):tool==="text"?Number($("#ctl-text-end").value):100;
      const posX=tool==="sticker"?Number($("#ctl-sticker-x").value)/100*w:tool==="text"?Number($("#ctl-text-x").value)/100*w:w/2;
      const posY=tool==="sticker"?Number($("#ctl-sticker-y").value)/100*h:tool==="text"?Number($("#ctl-text-y").value)/100*h:h-30;
      const processed=[];
      for(let i=0;i<list.length;i++){
        const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d");
        const f=list[i],ratio=w/h;ctx.save();
        if(tool==="rotate"){ctx.translate(w/2,h/2);ctx.rotate(settings.rotate*Math.PI/180);ctx.scale(settings.flipX?-1:1,settings.flipY?-1:1);ctx.drawImage(f.canvas,-f.canvas.width/2,-f.canvas.height/2); }
        else if(tool==="crop"){const fill=$("#crop-fill").value;if(fill==="white"||fill==="black"){ctx.fillStyle=fill;ctx.fillRect(0,0,w,h)}const sc=fill==="cover"?Math.max(w/f.canvas.width,h/f.canvas.height):Math.min(w/f.canvas.width,h/f.canvas.height);const dw=f.canvas.width*sc,dh=f.canvas.height*sc;ctx.drawImage(f.canvas,(w-dw)/2,(h-dh)/2,dw,dh)}
        else if(tool!=="effects") ctx.drawImage(f.canvas,0,0,w,h);
        if(tool==="effects"){ctx.filter=settings.filter;ctx.drawImage(f.canvas,0,0,w,h);ctx.filter="none";if(settings.invert){const d=ctx.getImageData(0,0,w,h),p=d.data;for(let j=0;j<p.length;j+=4){p[j]=255-p[j];p[j+1]=255-p[j+1];p[j+2]=255-p[j+2]}ctx.putImageData(d,0,0)}}
        const pct=(i/list.length)*100;if((sticker||text)&&pct>=startPct&&pct<endPct){ctx.textAlign="center";ctx.textBaseline="middle";if(sticker){ctx.font=`${Math.max(16,Math.round(w*stSize))}px sans-serif`;ctx.fillText(sticker,posX,posY)}if(text){ctx.font=`bold ${textSize}px sans-serif`;ctx.lineWidth=3;ctx.strokeStyle="#123";ctx.strokeText(text,posX,posY);ctx.fillStyle=$("#text-color").value;ctx.fillText(text,posX,posY)}}ctx.restore();processed.push({canvas:c,delay:f.delay})}
      const blob=await encode(processed,w,h,delayScale,colors);showResult(blob,"gif",tool==="resize"?"Resized GIF":toolNames[tool],w,h);
    }catch(e){alert("편집에 실패했습니다: "+(e.message||e))}finally{busy=false;const b=$("[data-go]",$("#editor-tool-panel"));if(b){b.disabled=false;b.textContent="Go!"}}
  }
  async function convertMp4(){
    if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)throw Error("이 브라우저에서는 MP4 변환을 지원하지 않습니다. JPG 또는 GIF로 저장해 주세요.");
    const c=document.createElement("canvas");c.width=sourceInfo.width;c.height=sourceInfo.height;const ctx=c.getContext("2d"),stream=c.captureStream(20),mime=["video/mp4;codecs=avc1","video/mp4","video/webm"].find(x=>MediaRecorder.isTypeSupported(x))||"";
    const rec=new MediaRecorder(stream,mime?{mimeType:mime}:{}),chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);const stopped=new Promise(r=>rec.onstop=r);rec.start();
    for(const f of frames){ctx.drawImage(f.canvas,0,0);await new Promise(r=>setTimeout(r,f.delay))}rec.stop();await stopped;stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:rec.mimeType});showResult(blob,rec.mimeType.includes("mp4")?"mp4":"webm","Converted video",c.width,c.height)
  }
  function showResult(blob,ext,title,w,h){
    edited={blob,ext,title,w,h};if(title==="Resized GIF"){$("#original-body").hidden=true;$("#toggle-original").textContent="+";}const url=URL.createObjectURL(blob);$("#editor-result").src=url;$("#result-title").textContent=title;$("#result-info").innerHTML=[["형식",ext.toUpperCase()],["용량",bytes(blob.size)],["해상도",w+" × "+h],["프레임",ext==="gif"?frames.length+"장":"정지/영상"]].map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");$("#result-panel").hidden=false;$("#editor-save").disabled=false;$("#result-download").onclick=()=>download(blob,`Resized_${sourceFile.name.replace(/\.gif$/i,"")}.${ext}`);
  }
  function download(blob,name){const a=document.createElement("a"),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),10000)}
  $("#editor-save").onclick=()=>{if(!edited)return;let name=$("#editor-save-name").value.trim()||sourceFile.name.replace(/\.gif$/i,"")+"_ed";name=name.replace(/[\\/:*?"<>|]/g,"");name=name.replace(/\.(gif|jpg|mp4|webm)$/i,"")+"."+edited.ext;download(edited.blob,name)};
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("is-active",x===b));$("#create-page").hidden=b.dataset.page!=="create";$("#edit-page").hidden=b.dataset.page!=="edit";window.scrollTo({top:0,behavior:"smooth"})});
})();

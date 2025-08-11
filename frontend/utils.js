
async function attachAutocomplete(inputId, resultsId){
  const input=document.getElementById(inputId); const results=document.getElementById(resultsId); let t=null;
  input.addEventListener('input', ()=>{
    clearTimeout(t); const q=input.value.trim();
    if(!q){ results.innerHTML=''; results.style.display='none'; return; }
    t=setTimeout(async()=>{
      try{ const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6`);
        const data=await r.json();
        results.innerHTML=data.map(d=>`<div class="ac-item" data-v="${d.display_name}">${d.display_name}</div>`).join('');
        results.style.display=data.length?'block':'none';
      }catch(e){ results.innerHTML=''; results.style.display='none'; }
    }, 250);
  });
  results.addEventListener('click', e=>{ const el=e.target.closest('.ac-item'); if(!el) return; input.value=el.getAttribute('data-v'); results.innerHTML=''; results.style.display='none'; });
}
function haversine(lat1,lon1,lat2,lon2){function toRad(d){return d*Math.PI/180}if([lat1,lon1,lat2,lon2].some(v=>v==null||isNaN(v)))return Infinity;const R=6371;const dLat=toRad(lat2-lat1);const dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function copyText(s){navigator.clipboard?.writeText(s).then(()=>alert('Copied'));}
function mapLink(s){if(s.lat!=null&&s.lon!=null) return `https://www.google.com/maps?q=${s.lat},${s.lon}`; return `https://www.google.com/maps?q=${encodeURIComponent(s.address||s.name)}`;}
function favs(){return JSON.parse(localStorage.getItem('favs')||'[]')}
function toggleFav(id){let f=favs(); if(f.includes(id))f=f.filter(x=>x!==id); else f.push(id); localStorage.setItem('favs',JSON.stringify(f));}
function isFav(id){return favs().includes(id);}
function parseHHMM(str){const m=(str||'').match(/(\d{1,2}):(\d{2})/); if(!m) return null; let h=parseInt(m[1],10), mi=parseInt(m[2],10); if(h<0||h>23||mi<0||mi>59) return null; return {h,mi};}
function minutesUntilNext(h,mi){const now=new Date(); const t=new Date(now); t.setHours(h,mi,0,0); let diff=(t-now)/60000; if(diff<0) diff+=1440; return Math.round(diff);}

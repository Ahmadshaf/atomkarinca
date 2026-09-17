import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getDatabase, ref, onValue, update, push, set } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

const app = initializeApp(window.EVA_FIREBASE_CONFIG);
const db = getDatabase(app);
const auth = getAuth(app);
const state = { user: null, rows: [], filter: 'pending', search: '', listenerStarted: false, priceListenerStarted: false, teamListenerStarted: false, placesListenerStarted: false, servicesListenerStarted: false, cardsListenerStarted: false, calendarListenerStarted: false, furnitureCalendarListenerStarted: false, team: [], places: [], services: [], cards: [], calendar: [], furnitureCalendar: [], adminView: new Date(), adminSelectedDate: null, furnView: new Date(), furnSelectedDate: null };
const el = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const pretty = s => new Intl.DateTimeFormat('tr-TR',{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(`${s}T12:00:00`));

document.querySelectorAll('.admin-menu-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.admin-menu-btn').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.admin-content-panel').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    el(btn.dataset.panel)?.classList.add('active');
  });
});


async function repairCalendarFromBookings(){
  if(!state.user) return;
  try{
    const token = await state.user.getIdTokenResult();
    if(token.claims.admin !== true) return;
    // Ayrı path'ler: bir path reddedilirse diğeri bozulmasın
    for (const b of state.rows) {
      if(!b.id || !b.booking_date) continue;
      const status=String(b.status||'pending').toLowerCase();
      if(!['pending','approved'].includes(status)) continue;
      const isFurniture = b.booking_category==='furniture' || ['Koltuk Temizliği','Koltuk temizliği','Sandalye','Yatak'].includes(b.property_type||b.furniture_type||'');
      const path = isFurniture ? `calendar_furniture/${b.id}` : `calendar/${b.id}`;
      try {
        await update(ref(db, path), {
          booking_date: b.booking_date,
          status,
          time_slot: b.time_slot || 'full'
        });
      } catch (err) {
        console.warn('Takvim eşitleme atlandı:', path, err?.code || err?.message || err);
      }
    }
  }catch(e){ console.error('Takvim eşitleme hatası:',e); }
}

function render(){
  if(!state.user) return;
  const box=el('adminBookings'); let rows=[...state.rows];
  if(state.filter!=='all') rows=rows.filter(x=>(x.status||'pending').toLowerCase()===state.filter);
  const q=state.search.trim().toLowerCase().replace(/\s/g,'');
  if(q) rows=rows.filter(x=>(x.customer_name||'').toLowerCase().includes(state.search.trim().toLowerCase())||(x.phone||'').replace(/\s/g,'').includes(q));
  rows.sort((a,b)=>String(a.booking_date).localeCompare(String(b.booking_date))||Number(b.created_at||0)-Number(a.created_at||0));
  if(el('adminCount')) el('adminCount').textContent=`Toplam ${state.rows.length} rezervasyon • Bu görünümde ${rows.length}`;
  if(!rows.length){ box.innerHTML='<p>Bu filtrede rezervasyon bulunmuyor.</p>'; return; }
  box.innerHTML=rows.map(b=>{
    const s=(b.status||'pending').toLowerCase();
    const isFurniture = b.booking_category==='furniture' || ['Koltuk Temizliği','Koltuk temizliği','Sandalye','Yatak'].includes(b.property_type||b.furniture_type||'');
    const catBadge = isFurniture ? '<span class="status" style="background:#ede9fe;color:#5b21b6">MOBİLYA</span>' : '<span class="status" style="background:#e0f2fe;color:#0369a1">TEMİZLİK</span>';
    const qtyLine = isFurniture && b.quantity ? `<span>🔢 Adet: ${esc(b.quantity)}</span>` : '';
    const placeLine = isFurniture
      ? `<span>🛋️ ${esc(b.furniture_type||b.property_type||b.service_type)}</span>`
      : `<span>🏠 ${esc(b.property_type)} — ${esc(b.room_count)}${b.bathroom_count ? ` · ${esc(b.bathroom_count)} banyo` : ''}</span>`;
    return `<details class="booking-summary"><summary><strong>${esc(b.customer_name)}</strong><span class="summary-date">${esc(pretty(b.booking_date))}</span><span class="summary-service">${esc(b.service_type||b.furniture_type||b.property_type)}</span>${catBadge}<span class="status ${esc(s)}">${s==='pending'?'BEKLİYOR':s==='approved'?'ONAYLI':'RED'}</span></summary><div class="booking-detail"><div class="booking-detail-grid"><span>📞 ${esc(b.phone)}</span>${placeLine}${qtyLine}<span>⏰ ${esc(b.time_slot==='morning'?'Sabah (12:00\'ye kadar)':b.time_slot==='afternoon'?'Öğleden sonra (12:00 sonrası)':'Tam gün')}</span><span>📍 ${esc(b.address)}</span><span>🧽 ${esc(b.service_type||b.furniture_type||'-')}</span><span>💰 ${ (b.price ?? b.estimated_price) ? new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(b.price ?? b.estimated_price) : 'Fiyat yok'}</span><span>📩 ${b.sms_notified===true?'SMS gönderildi':b.sms_error?'SMS hata':'SMS bekliyor'}</span></div>${b.notes?`<p><strong>Ek istek:</strong> ${esc(b.notes)}</p>`:''}<div class="booking-actions">${s!=='approved'?`<button class="approve" onclick="updateBooking('${b.id}','approved')">Onayla</button>`:''}${s!=='rejected'?`<button class="reject" onclick="updateBooking('${b.id}','rejected')">Reddet</button>`:''}</div></div></details>`;
  }).join('');
}

window.updateBooking=async(id,status)=>{
  try{
    const booking=state.rows.find(x=>x.id===id);
    if(!booking) throw new Error('Rezervasyon bulunamadı');
    // Önce rezervasyon durumu (asıl işlem)
    await update(ref(db,`bookings/${id}`),{status});
    const isFurniture = booking.booking_category==='furniture' || ['Koltuk Temizliği','Koltuk temizliği','Sandalye','Yatak'].includes(booking.property_type||booking.furniture_type||'');
    const calPath = isFurniture ? `calendar_furniture/${id}` : `calendar/${id}`;
    // Takvim ayrı — izin hatası olsa bile onay/red başarılı sayılsın
    try {
      if (status === 'rejected') {
        // Reddedilen dilimi takvimden kaldır (gün tekrar açılsın)
        await update(ref(db), { [calPath]: null });
      } else {
        await update(ref(db, calPath), {
          booking_date: booking.booking_date,
          status,
          time_slot: booking.time_slot || 'full'
        });
      }
    } catch (calErr) {
      console.warn('Takvim güncellenemedi (rezervasyon kaydedildi):', calErr?.code || calErr?.message || calErr);
      if (String(calErr?.code || calErr?.message || '').includes('PERMISSION')) {
        alert('Rezervasyon güncellendi ama takvim yazılamadı.\n\nFirebase kurallarında calendar_furniture yayınlanmamış olabilir. database.rules.json dosyasını Firebase Console → Realtime Database → Rules bölümüne yapıştırıp Publish edin.');
      }
    }
  }catch(e){
    console.error('Rezervasyon durumu güncellenemedi:',e);
    alert('İşlem başarısız: '+(e?.message||e));
  }
};

el('bookingSearch').oninput=e=>{state.search=e.target.value;render()};
document.querySelectorAll('.admin-filters button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.admin-filters button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); state.filter=b.dataset.filter; render();
});

el('logoutBtn').onclick=async()=>{
  await signOut(auth);
  location.replace('admin-giris.html');
};


const DEFAULT_PRICES = {
  room_1_1:6500, room_2_1:7500, room_3_1:8500, room_4_1:10000,
  room_duplex:14000, sofa:1500, chair:50, bed:750
};
const PRICE_INPUTS = {
  room_1_1:'price_1_1', room_2_1:'price_2_1', room_3_1:'price_3_1',
  room_4_1:'price_4_1', room_duplex:'price_duplex', sofa:'price_sofa',
  chair:'price_chair', bed:'price_bed'
};

function fillPriceInputs(prices){
  const merged={...DEFAULT_PRICES,...(prices||{})};
  Object.entries(PRICE_INPUTS).forEach(([key,id])=>{
    const input=el(id);
    if(input) input.value=Number(merged[key] ?? 0);
  });
}

function startPriceListener(){
  if(state.priceListenerStarted) return;
  state.priceListenerStarted=true;
  onValue(ref(db,'pricing'),snap=>fillPriceInputs(snap.val()),e=>{
    console.error('Fiyatlar okunamadı:',e);
    fillPriceInputs(DEFAULT_PRICES);
  });
}

el('savePricesBtn').onclick=async()=>{
  const msg=el('priceSaveMessage');
  try{
    const prices={};
    Object.entries(PRICE_INPUTS).forEach(([key,id])=>{
      const value=Number(el(id).value);
      if(!Number.isFinite(value) || value < 0) throw new Error('Tüm fiyatlar geçerli bir sayı olmalı.');
      prices[key]=value;
    });
    await update(ref(db,'pricing'),prices);
    msg.style.color='#15803d';
    msg.textContent='Fiyatlar kaydedildi.';
  }catch(e){
    console.error(e);
    msg.style.color='#be123c';
    msg.textContent='Kaydedilemedi: '+(e?.message||e);
  }
};



/* ---- Fiyat Kartları ---- */
const DEFAULT_PRICE_CARDS = [
  {title:'Ev / Daire',startFrom:true,items:[{name:'1+1',price:6500},{name:'2+1',price:7500},{name:'3+1',price:8500},{name:'4+1',price:10000},{name:'4+1 Dubleks',price:14000}],note:'🚿 2+1, 3+1 veya 4+1 dairelerde <strong>1’den fazla banyo</strong> olursa her ekstra banyo için <strong>+500 TL</strong> ek ücret alınır.'},
  {title:'Koltuk Yıkama',startFrom:false,items:[{name:'Standart koltuk yıkama',price:1500}],note:''},
  {title:'Sandalye',startFrom:false,items:[{name:'Adet başına',price:50}],note:''},
  {title:'Yatak',startFrom:false,items:[{name:'Adet başına',price:750}],note:''},
  {title:'Dolu Ev Temizliği',startFrom:true,items:[{name:'1+1',price:6500},{name:'2+1',price:7500}],note:''}
];
function renderAdminCards(){
  const box=el('adminCardsList'); if(!box) return;
  if(!state.cards.length){ box.innerHTML='<p class="note">Kart yok. "Varsayılan kartları yükle" veya yeni kart ekleyin.</p>'; return; }
  box.innerHTML=state.cards.map((card,ci)=>{
    const items=Array.isArray(card.items)?card.items:[];
    const itemsHtml=items.map((it,ii)=>`
      <div class="admin-team-row" style="margin:6px 0">
        <div class="admin-team-person">
          <span class="admin-team-avatar" style="font-size:12px">${esc(String(it.name||'').charAt(0).toUpperCase()||'?')}</span>
          <strong>${esc(it.name)} — ${new Intl.NumberFormat('tr-TR').format(Number(it.price)||0)} TL</strong>
        </div>
        <button class="team-remove-btn" type="button" onclick="removeCardItem(${ci},${ii})">Sil</button>
      </div>`).join('');
    return `<div style="border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:16px;background:#f8fbff">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
        <strong style="font-size:18px">${esc(card.title)}</strong>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <label style="font-size:12px;display:flex;align-items:center;gap:6px;font-weight:700">
            <input type="checkbox" ${card.startFrom?'checked':''} onchange="toggleCardStartFrom(${ci},this.checked)"> “TL’den” göster
          </label>
          <button class="team-remove-btn" type="button" onclick="removeCard(${ci})">Kartı Sil</button>
        </div>
      </div>
      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">Başlık</label>
      <input type="text" value="${esc(card.title)}" onchange="updateCardTitle(${ci},this.value)" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;font-weight:700;margin-bottom:10px">
      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px">Not (opsiyonel — boşsa sarı kutu yok)</label>
      <textarea onchange="updateCardNote(${ci},this.value)" rows="2" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;font-size:13px;margin-bottom:10px">${esc(card.note||'')}</textarea>
      <div style="margin:8px 0;font-weight:800;font-size:13px;color:#64748b">Fiyat satırları</div>
      ${itemsHtml||'<p class="note">Henüz satır yok. Aşağıdan ekleyin.</p>'}
      <div class="team-admin-add" style="margin-top:12px;grid-template-columns:1fr 120px auto">
        <input id="newItemName_${ci}" type="text" maxlength="40" placeholder="Örn: 1+1">
        <input id="newItemPrice_${ci}" type="number" min="0" step="50" placeholder="Fiyat">
        <button class="btn primary" type="button" onclick="addCardItem(${ci})">Satır Ekle</button>
      </div>
    </div>`;
  }).join('');
}
function startCardsListener(){
  if(state.cardsListenerStarted) return;
  state.cardsListenerStarted=true;
  onValue(ref(db,'pricing/cards'),snap=>{
    const v=snap.val();
    state.cards=Array.isArray(v)?v.filter(c=>c&&c.title):[];
    renderAdminCards();
  },e=>{ console.error(e); state.cards=[]; renderAdminCards(); });
}
async function saveCards(list){ await update(ref(db),{'pricing/cards':list}); }
el('addCardBtn')?.addEventListener('click',async()=>{
  const input=el('newCardTitle'), msg=el('cardsSaveMessage');
  const title=(input?.value||'').trim();
  if(!title){ msg.style.color='#be123c'; msg.textContent='Kart başlığı yazın.'; return; }
  try{ await saveCards([...state.cards,{title,startFrom:true,items:[],note:''}]); if(input) input.value=''; msg.style.color='#15803d'; msg.textContent='Kart eklendi.'; }
  catch(e){ msg.style.color='#be123c'; msg.textContent='Eklenemedi: '+(e?.message||e); }
});
el('resetCardsBtn')?.addEventListener('click',async()=>{
  const msg=el('cardsSaveMessage');
  if(!confirm('Tüm fiyat kartları varsayılana dönecek (Ev/Daire, Koltuk, Sandalye, Yatak, Dolu Ev). Emin misiniz?')) return;
  try{
    await saveCards(DEFAULT_PRICE_CARDS.map(c=>JSON.parse(JSON.stringify(c))));
    msg.style.color='#15803d'; msg.textContent='Varsayılan 5 kart yüklendi.';
  }catch(e){ msg.style.color='#be123c'; msg.textContent='Yüklenemedi: '+(e?.message||e); }
});
window.updateCardTitle=async(ci,title)=>{ if(!state.cards[ci]) return; try{ await saveCards(state.cards.map((c,i)=>i===ci?{...c,title:(title||'').trim()||c.title}:c)); }catch(e){console.error(e);} };
window.updateCardNote=async(ci,note)=>{ if(!state.cards[ci]) return; try{ await saveCards(state.cards.map((c,i)=>i===ci?{...c,note:note||''}:c)); }catch(e){console.error(e);} };
window.toggleCardStartFrom=async(ci,checked)=>{ if(!state.cards[ci]) return; try{ await saveCards(state.cards.map((c,i)=>i===ci?{...c,startFrom:!!checked}:c)); }catch(e){console.error(e);} };
window.addCardItem=async(ci)=>{
  if(!state.cards[ci]) return;
  const nameEl=el('newItemName_'+ci), priceEl=el('newItemPrice_'+ci), msg=el('cardsSaveMessage');
  const name=(nameEl?.value||'').trim(), price=Number(priceEl?.value);
  if(!name){ msg.style.color='#be123c'; msg.textContent='Satır adı yazın.'; return; }
  if(!Number.isFinite(price)||price<0){ msg.style.color='#be123c'; msg.textContent='Geçerli fiyat girin.'; return; }
  try{ await saveCards(state.cards.map((c,i)=>i===ci?{...c,items:[...(c.items||[]),{name,price}]}:c)); if(nameEl) nameEl.value=''; if(priceEl) priceEl.value=''; msg.style.color='#15803d'; msg.textContent='Satır eklendi.'; }
  catch(e){ msg.style.color='#be123c'; msg.textContent='Eklenemedi.'; }
};
window.removeCardItem=async(ci,ii)=>{
  if(!state.cards[ci]?.items?.[ii]) return;
  if(!confirm(`"${state.cards[ci].items[ii].name}" silinsin mi?`)) return;
  try{ await saveCards(state.cards.map((c,i)=>i===ci?{...c,items:(c.items||[]).filter((_,j)=>j!==ii)}:c)); el('cardsSaveMessage').style.color='#15803d'; el('cardsSaveMessage').textContent='Silindi.'; }catch(e){console.error(e);}
};
window.removeCard=async(ci)=>{
  if(!state.cards[ci]) return;
  if(!confirm(`"${state.cards[ci].title}" silinsin mi?`)) return;
  try{ await saveCards(state.cards.filter((_,i)=>i!==ci)); el('cardsSaveMessage').style.color='#15803d'; el('cardsSaveMessage').textContent='Kart silindi.'; }catch(e){console.error(e);}
};
el('newCardTitle')?.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); el('addCardBtn')?.click(); } });

const DEFAULT_TEAM = ['Roina','Marina','Yeşim Arslan'];

function renderAdminTeam(){
  const box=el('adminTeamList');
  if(!box) return;
  if(!state.team.length){
    box.innerHTML='<p class="note">Ekipte kayıtlı kişi yok.</p>';
    return;
  }
  box.innerHTML=state.team.map((name,i)=>`
    <div class="admin-team-row">
      <div class="admin-team-person">
        <span class="admin-team-avatar">${esc(name.trim().charAt(0).toUpperCase() || '?')}</span>
        <strong>${esc(name)}</strong>
      </div>
      <button class="team-remove-btn" type="button" onclick="removeTeamMember(${i})">Çıkar</button>
    </div>
  `).join('');
}

function startTeamListener(){
  if(state.teamListenerStarted) return;
  state.teamListenerStarted=true;
  onValue(ref(db,'siteContent/team'),snap=>{
    const value=snap.val();
    state.team=Array.isArray(value) ? value.filter(x=>typeof x==='string' && x.trim()) : DEFAULT_TEAM.slice();
    renderAdminTeam();
  },e=>{
    console.error('Ekip okunamadı:',e);
    state.team=DEFAULT_TEAM.slice();
    renderAdminTeam();
  });
}

async function saveTeam(team){
  await update(ref(db),{'siteContent/team':team});
}

el('addTeamBtn').onclick=async()=>{
  const input=el('newTeamName');
  const msg=el('teamSaveMessage');
  const name=(input.value||'').trim();
  if(!name){ msg.style.color='#be123c'; msg.textContent='Lütfen bir isim yazın.'; return; }
  if(state.team.some(x=>x.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR'))){
    msg.style.color='#be123c'; msg.textContent='Bu kişi zaten ekipte.'; return;
  }
  try{
    await saveTeam([...state.team,name]);
    input.value='';
    msg.style.color='#15803d';
    msg.textContent='Ekip üyesi eklendi.';
  }catch(e){
    console.error(e);
    msg.style.color='#be123c';
    msg.textContent='Eklenemedi: '+(e?.message||e);
  }
};

window.removeTeamMember=async index=>{
  const name=state.team[index];
  if(name==null) return;
  if(!confirm(`${name} ekipten çıkarılsın mı?`)) return;
  const msg=el('teamSaveMessage');
  try{
    const next=state.team.filter((_,i)=>i!==index);
    await saveTeam(next);
    msg.style.color='#15803d';
    msg.textContent=`${name} ekipten çıkarıldı.`;
  }catch(e){
    console.error(e);
    msg.style.color='#be123c';
    msg.textContent='Çıkarılamadı: '+(e?.message||e);
  }
};

el('newTeamName')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'){ e.preventDefault(); el('addTeamBtn').click(); }
});



const DEFAULT_PLACES = ['Ev','Ofis','Boş daire','Villa','Diğer'];
const DEFAULT_SERVICES = ['Standart ev temizliği','Detaylı temizlik','Taşınma / inşaat sonrası'];

function renderAdminPlaces(){
  const box=el('adminPlacesList');
  if(!box) return;
  if(!state.places.length){
    box.innerHTML='<p class="note">Kayıtlı yer yok.</p>';
    return;
  }
  box.innerHTML=state.places.map((name,i)=>`
    <div class="admin-team-row">
      <div class="admin-team-person">
        <span class="admin-team-avatar">${esc(name.trim().charAt(0).toUpperCase() || '?')}</span>
        <strong>${esc(name)}</strong>
      </div>
      <button class="team-remove-btn" type="button" onclick="removePlace(${i})">Çıkar</button>
    </div>
  `).join('');
}

function startPlacesListener(){
  if(state.placesListenerStarted) return;
  state.placesListenerStarted=true;
  onValue(ref(db,'siteContent/propertyTypes'),snap=>{
    const value=snap.val();
    state.places=Array.isArray(value) ? value.filter(x=>typeof x==='string' && x.trim()) : DEFAULT_PLACES.slice();
    renderAdminPlaces();
  },e=>{
    console.error('Yerler okunamadı:',e);
    state.places=DEFAULT_PLACES.slice();
    renderAdminPlaces();
  });
}

async function savePlaces(places){
  await update(ref(db),{'siteContent/propertyTypes':places});
}

el('addPlaceBtn')?.addEventListener('click',async()=>{
  const input=el('newPlaceName');
  const msg=el('placeSaveMessage');
  const name=(input.value||'').trim();
  if(!name){ msg.style.color='#be123c'; msg.textContent='Lütfen bir yer adı yazın.'; return; }
  if(state.places.some(x=>x.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR'))){
    msg.style.color='#be123c'; msg.textContent='Bu yer zaten listede.'; return;
  }
  try{
    await savePlaces([...state.places,name]);
    input.value='';
    msg.style.color='#15803d';
    msg.textContent='Yer eklendi.';
  }catch(e){
    console.error(e);
    msg.style.color='#be123c';
    msg.textContent='Eklenemedi: '+(e?.message||e);
  }
});

window.removePlace=async index=>{
  const name=state.places[index];
  if(name==null) return;
  if(!confirm(`${name} listeden çıkarılsın mı?`)) return;
  const msg=el('placeSaveMessage');
  try{
    const next=state.places.filter((_,i)=>i!==index);
    await savePlaces(next);
    msg.style.color='#15803d';
    msg.textContent=`${name} listeden çıkarıldı.`;
  }catch(e){
    console.error(e);
    msg.style.color='#be123c';
    msg.textContent='Çıkarılamadı: '+(e?.message||e);
  }
};

el('newPlaceName')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'){ e.preventDefault(); el('addPlaceBtn')?.click(); }
});



function renderAdminServices(){
  const box=el('adminServicesList');
  if(!box) return;
  if(!state.services.length){
    box.innerHTML='<p class="note">Kayıtlı hizmet yok.</p>';
    return;
  }
  box.innerHTML=state.services.map((name,i)=>`
    <div class="admin-team-row">
      <div class="admin-team-person">
        <span class="admin-team-avatar">${esc(name.trim().charAt(0).toUpperCase() || '?')}</span>
        <strong>${esc(name)}</strong>
      </div>
      <button class="team-remove-btn" type="button" onclick="removeService(${i})">Çıkar</button>
    </div>
  `).join('');
}

function startServicesListener(){
  if(state.servicesListenerStarted) return;
  state.servicesListenerStarted=true;
  onValue(ref(db,'siteContent/serviceTypes'),snap=>{
    const value=snap.val();
    state.services=Array.isArray(value) ? value.filter(x=>typeof x==='string' && x.trim()) : DEFAULT_SERVICES.slice();
    renderAdminServices();
  },e=>{
    console.error('Hizmetler okunamadı:',e);
    state.services=DEFAULT_SERVICES.slice();
    renderAdminServices();
  });
}

async function saveServices(list){
  await update(ref(db),{'siteContent/serviceTypes':list});
}

el('addServiceBtn')?.addEventListener('click',async()=>{
  const input=el('newServiceName');
  const msg=el('serviceSaveMessage');
  const name=(input.value||'').trim();
  if(!name){ msg.style.color='#be123c'; msg.textContent='Lütfen bir hizmet adı yazın.'; return; }
  if(state.services.some(x=>x.toLocaleLowerCase('tr-TR')===name.toLocaleLowerCase('tr-TR'))){
    msg.style.color='#be123c'; msg.textContent='Bu hizmet zaten listede.'; return;
  }
  try{
    await saveServices([...state.services,name]);
    input.value='';
    msg.style.color='#15803d';
    msg.textContent='Hizmet eklendi.';
  }catch(e){
    console.error(e);
    msg.style.color='#be123c';
    msg.textContent='Eklenemedi: '+(e?.message||e);
  }
});

window.removeService=async index=>{
  const name=state.services[index];
  if(name==null) return;
  if(!confirm(`${name} listeden çıkarılsın mı?`)) return;
  const msg=el('serviceSaveMessage');
  try{
    await saveServices(state.services.filter((_,i)=>i!==index));
    msg.style.color='#15803d';
    msg.textContent=`${name} listeden çıkarıldı.`;
  }catch(e){
    console.error(e);
    msg.style.color='#be123c';
    msg.textContent='Çıkarılamadı: '+(e?.message||e);
  }
};

el('newServiceName')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'){ e.preventDefault(); el('addServiceBtn')?.click(); }
});

/* ---- Admin yarım gün takvim ---- */
const padAdmin=n=>String(n).padStart(2,'0');
const isoAdmin=d=>`${d.getFullYear()}-${padAdmin(d.getMonth()+1)}-${padAdmin(d.getDate())}`;
const prettyAdmin=s=>new Intl.DateTimeFormat('tr-TR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${s}T12:00:00`));

function adminDaySlots(key){
  const entries=state.calendar.filter(x=>x.booking_date===key);
  const slots={morning:null,afternoon:null,full:null,morningId:null,afternoonId:null,fullIds:[]};
  entries.forEach(e=>{
    const st=String(e.status||'pending').toLowerCase();
    const slot=e.time_slot||'full';
    if(slot==='full'){
      slots.full=st; slots.fullIds.push(e.id);
      if(st==='approved' || !slots.morning) slots.morning=st;
      if(st==='approved' || !slots.afternoon) slots.afternoon=st;
    } else if(slot==='morning'){
      if(st==='approved' || slots.morning!=='approved'){ slots.morning=st; slots.morningId=e.id; }
    } else if(slot==='afternoon'){
      if(st==='approved' || slots.afternoon!=='approved'){ slots.afternoon=st; slots.afternoonId=e.id; }
    }
  });
  if(slots.full==='approved'){ slots.morning='approved'; slots.afternoon='approved'; }
  return slots;
}

function renderAdminCalendar(){
  const y=state.adminView.getFullYear(), m=state.adminView.getMonth();
  const label=el('adminMonthLabel');
  if(label) label.textContent=new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric'}).format(state.adminView);
  const g=el('adminCalendarGrid');
  if(!g) return;
  g.innerHTML='';
  const first=new Date(y,m,1), days=new Date(y,m+1,0).getDate(), off=(first.getDay()+6)%7;
  for(let i=0;i<off;i++){ const b=document.createElement('button'); b.className='day empty'; b.disabled=true; g.appendChild(b); }
  for(let d=1;d<=days;d++){
    const date=new Date(y,m,d), key=isoAdmin(date);
    const slots=adminDaySlots(key);
    const b=document.createElement('button');
    b.type='button';
    b.className='day';
    b.innerHTML=`<span class="day-num">${d}</span><span class="day-half top"></span><span class="day-half bottom"></span>`;
    const morningBusy=slots.morning==='approved';
    const afternoonBusy=slots.afternoon==='approved';
    const morningPending=slots.morning==='pending' && !morningBusy;
    const afternoonPending=slots.afternoon==='pending' && !afternoonBusy;
    if(morningBusy && afternoonBusy) b.classList.add('booked');
    else {
      if(morningBusy) b.classList.add('half-morning-booked');
      else if(morningPending) b.classList.add('half-morning-pending');
      if(afternoonBusy) b.classList.add('half-afternoon-booked');
      else if(afternoonPending) b.classList.add('half-afternoon-pending');
    }
    if(state.adminSelectedDate===key) b.classList.add('selected');
    b.onclick=()=>{
      state.adminSelectedDate=key;
      updateAdminSelectedDay();
      renderAdminCalendar();
    };
    g.appendChild(b);
  }
}

function updateAdminSelectedDay(){
  const box=el('adminSelectedDay');
  if(!box) return;
  if(!state.adminSelectedDate){ box.textContent='Bir gün seçin'; return; }
  const s=adminDaySlots(state.adminSelectedDate);
  const mTxt=s.morning==='approved'?'DOLU':s.morning==='pending'?'İncelemede':'Boş';
  const aTxt=s.afternoon==='approved'?'DOLU':s.afternoon==='pending'?'İncelemede':'Boş';
  box.textContent=`${prettyAdmin(state.adminSelectedDate)} · Sabah: ${mTxt} · Öğleden sonra: ${aTxt}`;
}

el('adminPrevMonth')?.addEventListener('click',()=>{
  state.adminView=new Date(state.adminView.getFullYear(),state.adminView.getMonth()-1,1);
  renderAdminCalendar();
});
el('adminNextMonth')?.addEventListener('click',()=>{
  state.adminView=new Date(state.adminView.getFullYear(),state.adminView.getMonth()+1,1);
  renderAdminCalendar();
});

async function setAdminSlot(slot, makeBusy){
  const msg=el('calendarAdminMsg');
  if(!state.adminSelectedDate){
    msg.style.color='#be123c'; msg.textContent='Önce bir gün seçin.'; return;
  }
  if(!state.user){ msg.style.color='#be123c'; msg.textContent='Oturum yok.'; return; }
  try{
    const date=state.adminSelectedDate;
    const slots=adminDaySlots(date);
    if(makeBusy){
      // Eğer zaten doluysa atla
      if(slot==='morning' && slots.morning==='approved'){ msg.textContent='Sabah zaten dolu.'; return; }
      if(slot==='afternoon' && slots.afternoon==='approved'){ msg.textContent='Öğleden sonra zaten dolu.'; return; }
      const id=push(ref(db,'calendar')).key;
      await set(ref(db,`calendar/${id}`),{
        booking_date:date,
        status:'approved',
        time_slot:slot,
        source:'admin_block',
        created_at:Date.now()
      });
      msg.style.color='#15803d';
      msg.textContent=`${slot==='morning'?'Sabah':'Öğleden sonra'} dolu olarak işaretlendi.`;
    } else {
      // Admin bloklarını kaldır; rezervasyon kaynaklı onaylıları silme
      const entries=state.calendar.filter(x=>x.booking_date===date && (x.time_slot||'full')===slot);
      const updates={};
      entries.forEach(e=>{
        if(e.source==='admin_block' || (e.status==='approved' && !state.rows.some(b=>b.id===e.id))){
          updates[`calendar/${e.id}`]=null;
        } else if(e.status==='approved' && state.rows.some(b=>b.id===e.id)){
          // Gerçek rezervasyon - sadece reddetme önerisi
        }
      });
      // Ayrıca full slot admin bloklarını da temizle ilgili yarı için
      state.calendar.filter(x=>x.booking_date===date && (x.time_slot||'full')==='full' && x.source==='admin_block').forEach(e=>{
        updates[`calendar/${e.id}`]=null;
      });
      if(Object.keys(updates).length){
        await update(ref(db),updates);
        msg.style.color='#15803d';
        msg.textContent=`${slot==='morning'?'Sabah':'Öğleden sonra'} boşaltıldı.`;
      } else {
        // Onaylı rezervasyon varsa status rejected yapma - bilgi ver
        const bookingEntries=entries.filter(e=>state.rows.some(b=>b.id===e.id));
        if(bookingEntries.length){
          msg.style.color='#b45309';
          msg.textContent='Bu dilimde onaylı rezervasyon var. Rezervasyonlar sekmesinden reddedin.';
        } else {
          msg.style.color='#15803d';
          msg.textContent='Bu dilim zaten boş.';
        }
      }
    }
  }catch(e){
    console.error(e);
    msg.style.color='#be123c';
    msg.textContent='İşlem başarısız: '+(e?.message||e);
  }
}

el('blockMorningBtn')?.addEventListener('click',()=>setAdminSlot('morning',true));
el('freeMorningBtn')?.addEventListener('click',()=>setAdminSlot('morning',false));
el('blockAfternoonBtn')?.addEventListener('click',()=>setAdminSlot('afternoon',true));
el('freeAfternoonBtn')?.addEventListener('click',()=>setAdminSlot('afternoon',false));

function startAdminCalendarListener(){
  if(state.calendarListenerStarted) return;
  state.calendarListenerStarted=true;
  onValue(ref(db,'calendar'),snap=>{
    const rows=[];
    snap.forEach(c=>{
      const v=c.val()||{};
      rows.push({id:c.key,...v,status:String(v.status||'pending').toLowerCase(),time_slot:v.time_slot||'full'});
    });
    state.calendar=rows;
    renderAdminCalendar();
    updateAdminSelectedDay();
  },e=>console.error('Admin takvim okunamadı',e));
}

/* ---- Mobilya (koltuk/sandalye/yatak) takvim ---- */
function furnDaySlots(key){
  const entries=state.furnitureCalendar.filter(x=>x.booking_date===key);
  const slots={morning:null,afternoon:null,full:null,morningId:null,afternoonId:null,fullIds:[]};
  entries.forEach(e=>{
    const st=String(e.status||'pending').toLowerCase();
    const slot=e.time_slot||'full';
    if(slot==='full'){
      slots.full=st; slots.fullIds.push(e.id);
      if(st==='approved' || !slots.morning) slots.morning=st;
      if(st==='approved' || !slots.afternoon) slots.afternoon=st;
    } else if(slot==='morning'){
      if(st==='approved' || slots.morning!=='approved'){ slots.morning=st; slots.morningId=e.id; }
    } else if(slot==='afternoon'){
      if(st==='approved' || slots.afternoon!=='approved'){ slots.afternoon=st; slots.afternoonId=e.id; }
    }
  });
  if(slots.full==='approved'){ slots.morning='approved'; slots.afternoon='approved'; }
  return slots;
}

function renderFurnCalendar(){
  const y=state.furnView.getFullYear(), m=state.furnView.getMonth();
  const label=el('furnMonthLabel');
  if(label) label.textContent=new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric'}).format(state.furnView);
  const g=el('furnCalendarGrid');
  if(!g) return;
  g.innerHTML='';
  const first=new Date(y,m,1), days=new Date(y,m+1,0).getDate(), off=(first.getDay()+6)%7;
  for(let i=0;i<off;i++){ const b=document.createElement('button'); b.className='day empty'; b.disabled=true; g.appendChild(b); }
  for(let d=1;d<=days;d++){
    const date=new Date(y,m,d), key=isoAdmin(date);
    const slots=furnDaySlots(key);
    const b=document.createElement('button');
    b.type='button';
    b.className='day';
    b.innerHTML=`<span class="day-num">${d}</span><span class="day-half top"></span><span class="day-half bottom"></span>`;
    const morningBusy=slots.morning==='approved';
    const afternoonBusy=slots.afternoon==='approved';
    const morningPending=slots.morning==='pending' && !morningBusy;
    const afternoonPending=slots.afternoon==='pending' && !afternoonBusy;
    if(morningBusy && afternoonBusy) b.classList.add('booked');
    else {
      if(morningBusy) b.classList.add('half-morning-booked');
      else if(morningPending) b.classList.add('half-morning-pending');
      if(afternoonBusy) b.classList.add('half-afternoon-booked');
      else if(afternoonPending) b.classList.add('half-afternoon-pending');
    }
    if(state.furnSelectedDate===key) b.classList.add('selected');
    b.onclick=()=>{
      state.furnSelectedDate=key;
      updateFurnSelectedDay();
      renderFurnCalendar();
    };
    g.appendChild(b);
  }
}

function updateFurnSelectedDay(){
  const box=el('furnSelectedDay');
  if(!box) return;
  if(!state.furnSelectedDate){ box.textContent='Bir gün seçin'; return; }
  const s=furnDaySlots(state.furnSelectedDate);
  const mTxt=s.morning==='approved'?'DOLU':s.morning==='pending'?'İncelemede':'Boş';
  const aTxt=s.afternoon==='approved'?'DOLU':s.afternoon==='pending'?'İncelemede':'Boş';
  box.textContent=`${prettyAdmin(state.furnSelectedDate)} · Sabah: ${mTxt} · Öğleden sonra: ${aTxt}`;
}

el('furnPrevMonth')?.addEventListener('click',()=>{
  state.furnView=new Date(state.furnView.getFullYear(),state.furnView.getMonth()-1,1);
  renderFurnCalendar();
});
el('furnNextMonth')?.addEventListener('click',()=>{
  state.furnView=new Date(state.furnView.getFullYear(),state.furnView.getMonth()+1,1);
  renderFurnCalendar();
});

async function setFurnSlot(slot, makeBusy){
  const msg=el('furnCalendarAdminMsg');
  if(!state.furnSelectedDate){
    msg.style.color='#be123c'; msg.textContent='Önce bir gün seçin.'; return;
  }
  if(!state.user){ msg.style.color='#be123c'; msg.textContent='Oturum yok.'; return; }
  try{
    const date=state.furnSelectedDate;
    const slots=furnDaySlots(date);
    if(makeBusy){
      if(slot==='morning' && slots.morning==='approved'){ msg.textContent='Sabah zaten dolu.'; return; }
      if(slot==='afternoon' && slots.afternoon==='approved'){ msg.textContent='Öğleden sonra zaten dolu.'; return; }
      const id=push(ref(db,'calendar_furniture')).key;
      await set(ref(db,`calendar_furniture/${id}`),{
        booking_date:date,
        status:'approved',
        time_slot:slot,
        source:'admin_block',
        category:'furniture',
        created_at:Date.now()
      });
      msg.style.color='#15803d';
      msg.textContent=`${slot==='morning'?'Sabah':'Öğleden sonra'} dolu olarak işaretlendi.`;
    } else {
      const entries=state.furnitureCalendar.filter(x=>x.booking_date===date && (x.time_slot||'full')===slot);
      const updates={};
      entries.forEach(e=>{
        if(e.source==='admin_block' || (e.status==='approved' && !state.rows.some(b=>b.id===e.id))){
          updates[`calendar_furniture/${e.id}`]=null;
        }
      });
      state.furnitureCalendar.filter(x=>x.booking_date===date && (x.time_slot||'full')==='full' && x.source==='admin_block').forEach(e=>{
        updates[`calendar_furniture/${e.id}`]=null;
      });
      if(Object.keys(updates).length){
        await update(ref(db),updates);
        msg.style.color='#15803d';
        msg.textContent=`${slot==='morning'?'Sabah':'Öğleden sonra'} boşaltıldı.`;
      } else {
        const bookingEntries=entries.filter(e=>state.rows.some(b=>b.id===e.id));
        if(bookingEntries.length){
          msg.style.color='#b45309';
          msg.textContent='Bu dilimde onaylı rezervasyon var. Rezervasyonlar sekmesinden reddedin.';
        } else {
          msg.style.color='#15803d';
          msg.textContent='Bu dilim zaten boş.';
        }
      }
    }
  }catch(e){
    console.error(e);
    msg.style.color='#be123c';
    const errTxt = String(e?.code || e?.message || e);
    if (errTxt.includes('PERMISSION')) {
      msg.textContent='İzin hatası: Firebase Rules içine calendar_furniture ekleyip Publish edin.';
    } else {
      msg.textContent='İşlem başarısız: '+errTxt;
    }
  }
}

el('furnBlockMorningBtn')?.addEventListener('click',()=>setFurnSlot('morning',true));
el('furnFreeMorningBtn')?.addEventListener('click',()=>setFurnSlot('morning',false));
el('furnBlockAfternoonBtn')?.addEventListener('click',()=>setFurnSlot('afternoon',true));
el('furnFreeAfternoonBtn')?.addEventListener('click',()=>setFurnSlot('afternoon',false));

function startFurnitureCalendarListener(){
  if(state.furnitureCalendarListenerStarted) return;
  state.furnitureCalendarListenerStarted=true;
  onValue(ref(db,'calendar_furniture'),snap=>{
    const rows=[];
    snap.forEach(c=>{
      const v=c.val()||{};
      rows.push({id:c.key,...v,status:String(v.status||'pending').toLowerCase(),time_slot:v.time_slot||'full'});
    });
    state.furnitureCalendar=rows;
    renderFurnCalendar();
    updateFurnSelectedDay();
  },e=>console.error('Mobilya takvim okunamadı',e));
}

function startBookingsListener(){
  if(state.listenerStarted) return;
  state.listenerStarted=true;
  onValue(ref(db,'bookings'),snap=>{
    const rows=[];
    snap.forEach(c=>{ const value=c.val()||{}; rows.push({id:c.key,status:(value.status||'pending').toLowerCase(),...value}); });
    state.rows=rows;
    repairCalendarFromBookings();
    render();
  },e=>{
    console.error('Rezervasyonlar okunamadı',e);
    const box=el('adminBookings');
    if(box) box.innerHTML=`<p style="color:#be123c;font-weight:800">Rezervasyonlar Firebase'den okunamadı: ${esc(e.code||e.message||'Bilinmeyen hata')}</p>`;
  });
}

onAuthStateChanged(auth,async user=>{
  if(!user){ location.replace('admin-giris.html'); return; }
  try{
    const token=await user.getIdTokenResult(true);
    if(token.claims.admin!==true){ await signOut(auth); location.replace('admin-giris.html'); return; }
    state.user=user;
    el('adminGate').hidden=true;
    el('adminLoggedIn').hidden=false;
    startBookingsListener();
    startPriceListener();
    startCardsListener();
    startTeamListener();
    startPlacesListener();
    startServicesListener();
    startAdminCalendarListener();
    startFurnitureCalendarListener();
    renderAdminCalendar();
    renderFurnCalendar();
  }catch(e){
    console.error(e);
    await signOut(auth).catch(()=>{});
    location.replace('admin-giris.html');
  }
});

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getDatabase, ref, push, set, update, onValue } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const app=initializeApp(window.EVA_FIREBASE_CONFIG); const db=getDatabase(app);
const state={view:new Date(),selected:null,selectedSlot:'full',calendar:[],lastEstimate:null};
const el=id=>document.getElementById(id);

const DEFAULT_PROPERTY_TYPES = ['Ev','Ofis','Boş daire','Villa','Diğer'];
const DEFAULT_SERVICE_TYPES = ['Standart ev temizliği','Detaylı temizlik','Taşınma / inşaat sonrası'];
const FURNITURE_TYPES = new Set(['koltuk temizliği','koltuk yıkama','sandalye','yatak']);

const LIVE_PRICE_MAP = {
  room_1_1:['roomAdd','1+1'], room_2_1:['roomAdd','2+1'], room_3_1:['roomAdd','3+1'],
  room_4_1:['roomAdd','4+1'], room_duplex:['roomAdd','4+1 Dubleks']
};
onValue(ref(db,'pricing'),snap=>{
  const prices=snap.val();
  if(!prices || !window.EVA_PRICING) return;
  Object.entries(LIVE_PRICE_MAP).forEach(([key,[group,name]])=>{
    if(prices[key]!=null && window.EVA_PRICING[group]) window.EVA_PRICING[group][name]=Number(prices[key]);
  });
  if(document.getElementById('bookingForm')) updateEstimate();
},err=>console.error('Fiyatlar okunamadı',err));

function fillSelect(select, list, keepValue){
  if(!select) return;
  const current = keepValue ?? select.value;
  select.innerHTML = '<option value="">Seçiniz</option>' + list.map(n=>`<option value="${n}">${n}</option>`).join('');
  if(list.includes(current)) select.value = current;
}

function isFurniturePlace(name){
  return FURNITURE_TYPES.has(String(name||'').toLocaleLowerCase('tr-TR').trim());
}

onValue(ref(db,'siteContent/propertyTypes'),snap=>{
  const value=snap.val();
  const list=Array.isArray(value) && value.length
    ? value.filter(x=>typeof x==='string' && x.trim() && !isFurniturePlace(x)).map(x=>x.trim())
    : DEFAULT_PROPERTY_TYPES.slice();
  fillSelect(el('propertyTypeSelect') || document.querySelector('select[name="property_type"]'), list);
  updateEstimate();
},err=>console.error('Temizlenecek yerler okunamadı',err));

onValue(ref(db,'siteContent/serviceTypes'),snap=>{
  const value=snap.val();
  const list=Array.isArray(value) && value.length
    ? value.filter(x=>typeof x==='string' && x.trim()).map(x=>x.trim())
    : DEFAULT_SERVICE_TYPES.slice();
  fillSelect(el('serviceTypeSelect') || document.querySelector('select[name="service_type"]'), list);
  updateEstimate();
},err=>console.error('Hizmet türleri okunamadı',err));

const pad=n=>String(n).padStart(2,'0');
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const pretty=s=>new Intl.DateTimeFormat('tr-TR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${s}T12:00:00`));

function slotLabel(slot){
  if(slot==='morning') return 'Sabah (12:00\'ye kadar)';
  if(slot==='afternoon') return 'Öğleden sonra (12:00 sonrası)';
  return 'Tam gün';
}

function daySlotState(key){
  const entries = state.calendar.filter(x=>x.booking_date===key);
  const slots = { morning: null, afternoon: null, full: null };
  entries.forEach(e=>{
    const st = String(e.status||'pending').toLowerCase();
    const slot = e.time_slot || 'full';
    if(slot==='full'){
      slots.full = st;
      if(!slots.morning || slots.morning==='pending') slots.morning = st;
      if(!slots.afternoon || slots.afternoon==='pending') slots.afternoon = st;
    } else if(slot==='morning'){
      if(st==='approved' || !slots.morning || slots.morning==='pending') slots.morning = st;
    } else if(slot==='afternoon'){
      if(st==='approved' || !slots.afternoon || slots.afternoon==='pending') slots.afternoon = st;
    }
  });
  // approved overrides pending for display priority
  const rank = s => s==='approved' ? 2 : s==='pending' ? 1 : 0;
  if(slots.full==='approved'){ slots.morning='approved'; slots.afternoon='approved'; }
  return slots;
}

function isSlotAvailable(key, slot){
  const s = daySlotState(key);
  if(slot==='full'){
    return s.morning !== 'approved' && s.afternoon !== 'approved' && s.full !== 'approved';
  }
  if(slot==='morning') return s.morning !== 'approved' && s.full !== 'approved';
  if(slot==='afternoon') return s.afternoon !== 'approved' && s.full !== 'approved';
  return true;
}

function render(){
  const y=state.view.getFullYear(), m=state.view.getMonth();
  el('monthLabel').textContent=new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric'}).format(state.view);
  const g=el('calendarGrid'); g.innerHTML='';
  const first=new Date(y,m,1), days=new Date(y,m+1,0).getDate(), off=(first.getDay()+6)%7;
  for(let i=0;i<off;i++){ const b=document.createElement('button'); b.className='day empty'; b.disabled=true; g.appendChild(b); }
  const today=new Date(); today.setHours(0,0,0,0);
  for(let d=1;d<=days;d++){
    const date=new Date(y,m,d), key=iso(date);
    const slots=daySlotState(key);
    const b=document.createElement('button');
    b.className='day';
    b.innerHTML=`<span class="day-num">${d}</span><span class="day-half top"></span><span class="day-half bottom"></span>`;

    const morningBusy = slots.morning==='approved' || slots.full==='approved';
    const afternoonBusy = slots.afternoon==='approved' || slots.full==='approved';
    const morningPending = slots.morning==='pending' && !morningBusy;
    const afternoonPending = slots.afternoon==='pending' && !afternoonBusy;

    if(date<today){
      b.classList.add('disabled'); b.disabled=true;
    } else if(morningBusy && afternoonBusy){
      b.classList.add('booked'); b.disabled=true;
    } else {
      if(morningBusy) b.classList.add('half-morning-booked');
      else if(morningPending) b.classList.add('half-morning-pending');
      if(afternoonBusy) b.classList.add('half-afternoon-booked');
      else if(afternoonPending) b.classList.add('half-afternoon-pending');

      if(state.selected===key) b.classList.add('selected');
      b.onclick=()=>{
        state.selected=key;
        el('selectedDate').value=key;
        const slot = el('timeSlotSelect')?.value || 'full';
        state.selectedSlot = slot;
        updateSelectedText();
        render();
      };
    }
    g.appendChild(b);
  }
}

function updateSelectedText(){
  if(!state.selected){
    el('selectedDateText').textContent='Henüz tarih seçilmedi';
    return;
  }
  const slot = el('timeSlotSelect')?.value || state.selectedSlot || 'full';
  el('selectedDateText').textContent = `${pretty(state.selected)} · ${slotLabel(slot)}`;
}

el('prevMonth').onclick=()=>{ state.view=new Date(state.view.getFullYear(),state.view.getMonth()-1,1); render(); };
el('nextMonth').onclick=()=>{ state.view=new Date(state.view.getFullYear(),state.view.getMonth()+1,1); render(); };

el('timeSlotSelect')?.addEventListener('change',()=>{
  state.selectedSlot = el('timeSlotSelect').value;
  updateSelectedText();
});

onValue(ref(db,'calendar'),snap=>{
  const rows=[];
  snap.forEach(c=>{
    const v=c.val()||{};
    rows.push({id:c.key,...v,status:String(v.status||'pending').toLowerCase(),time_slot:v.time_slot||'full'});
  });
  state.calendar=rows;
  render();
},err=>console.error('Takvim okunamadı',err));

function updateEstimate(){
  const form=el('bookingForm');
  if(!form) return;
  const fd=new FormData(form);
  const property=fd.get('property_type');
  const room=fd.get('room_count');
  const service=fd.get('service_type');
  const bathroom=fd.get('bathroom_count');

  if(!property || !room || !service){
    el('estimatedPrice').textContent='Seçimlerinizi yapın';
    state.lastEstimate=null;
    return;
  }

  state.lastEstimate=window.calculateEvaPrice(property,room,service,null,bathroom);
  el('estimatedPrice').textContent=window.formatTL(state.lastEstimate.total);
}

['property_type','room_count','service_type','bathroom_count'].forEach(name=>{
  el('bookingForm')?.elements[name]?.addEventListener('input',updateEstimate);
  el('bookingForm')?.elements[name]?.addEventListener('change',updateEstimate);
});

el('bookingForm').onsubmit=async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const msg=el('formMessage');
  msg.textContent='';

  if(!state.selected){
    msg.style.color='#be123c';
    msg.textContent='Lütfen önce takvimden bir tarih seçin.';
    return;
  }

  const fd=new FormData(form);
  const timeSlot = fd.get('time_slot') || 'full';
  if(!isSlotAvailable(state.selected, timeSlot)){
    msg.style.color='#be123c';
    msg.textContent='Seçtiğiniz dilim dolu. Lütfen başka bir tarih veya dilim seçin.';
    return;
  }

  const whatsappWindow = window.open('', '_blank');
  const btn=el('submitBooking');
  btn.disabled=true;
  btn.textContent='Gönderiliyor...';

  const id=push(ref(db,'bookings')).key;
  const token=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`).replaceAll('-','');
  const bathroomCount=Math.max(1, Number(fd.get('bathroom_count')) || 1);
  const property=fd.get('property_type');
  const estimate=window.calculateEvaPrice(
    property,
    fd.get('room_count'),
    fd.get('service_type'),
    null,
    bathroomCount
  );

  const booking={
    booking_date:state.selected,
    time_slot:timeSlot,
    customer_name:fd.get('customer_name')?.trim(),
    phone:fd.get('phone')?.trim(),
    address:fd.get('address')?.trim(),
    property_type:property,
    room_count:fd.get('room_count')||'',
    bathroom_count:bathroomCount,
    service_type:fd.get('service_type')||'',
    notes:fd.get('notes')?.trim()||'',
    status:'pending',
    created_at:Date.now(),
    approval_token:token,
    sms_notified:false,
    estimated_price:estimate.total,
    price:estimate.total,
    price_breakdown:estimate,
    booking_category:'cleaning'
  };

  try{
    await set(ref(db,`bookings/${id}`), booking);
    try {
      await set(ref(db,`calendar/${id}`), {
        booking_date:state.selected,
        status:'pending',
        time_slot:timeSlot
      });
    } catch(calendarErr) {
      console.warn('Takvim kaydı yazılamadı, rezervasyon yine kaydedildi:', calendarErr);
    }

    const whatsappNumber='905431231041';
    const whatsappMessage=[
      '🧹 *ATOM - Yeni Rezervasyon*',
      '',
      `👤 Ad Soyad: ${booking.customer_name || '-'}`,
      `📞 Telefon: ${booking.phone || '-'}`,
      `📅 Tarih: ${pretty(booking.booking_date)}`,
      `⏰ Dilim: ${slotLabel(timeSlot)}`,
      `📍 Adres: ${booking.address || '-'}`,
      `🏠 Yer: ${booking.property_type || '-'}`,
      booking.room_count ? `🚪 Daire Tipi: ${booking.room_count}` : '',
      `🚿 Banyo: ${booking.bathroom_count}`,
      booking.service_type ? `🧽 Hizmet: ${booking.service_type}` : '',
      `💰 Fiyat: ${window.formatTL(estimate.total)}`,
      booking.notes ? `📝 Ek İstek: ${booking.notes}` : '',
      '',
      'Rezervasyon yönetici onayı bekliyor.',
      '',
      '🔐 Yönetici Girişi:',
      'https://misty-lake-95a0.ahmadshafiseddiqi.workers.dev/admin-giris.html'
    ].filter(Boolean).join('\n');

    const whatsappUrl=`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;

    msg.style.color='#15803d';
    msg.textContent='Rezervasyon talebiniz alındı. WhatsApp mesajı hazırlanıyor...';

    el('successPrice').innerHTML=
      `<div class="success-price">
        Fiyatınız: ${window.formatTL(estimate.total)}<br>
        <small>${pretty(booking.booking_date)} · ${slotLabel(timeSlot)}</small><br>
        <small>Rezervasyon yönetici onayına gönderildi.</small><br><br>
        <a class="btn primary" href="${whatsappUrl}" target="_blank" rel="noopener">
          WhatsApp'tan Gönder
        </a>
      </div>`;

    if (whatsappWindow && !whatsappWindow.closed) {
      whatsappWindow.location.href = whatsappUrl;
    }

    form.reset();
    if(form.elements.bathroom_count) form.elements.bathroom_count.value='1';
    if(form.elements.time_slot) form.elements.time_slot.value='full';
    state.selected=null;
    state.selectedSlot='full';
    state.lastEstimate=null;
    el('estimatedPrice').textContent='Seçimlerinizi yapın';
    el('selectedDate').value='';
    el('selectedDateText').textContent='Henüz tarih seçilmedi';
    render();

  }catch(err){
    if (whatsappWindow && !whatsappWindow.closed) whatsappWindow.close();
    console.error('Rezervasyon kaydı başarısız:',err);
    msg.style.color='#be123c';
    msg.textContent='Rezervasyon gönderilemedi. Lütfen tekrar deneyin.';
  }finally{
    btn.disabled=false;
    btn.textContent='Rezervasyon Talebi Gönder';
  }
};

render();

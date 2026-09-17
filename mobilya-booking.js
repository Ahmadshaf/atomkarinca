import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getDatabase, ref, push, set, onValue } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const app = initializeApp(window.EVA_FIREBASE_CONFIG);
const db = getDatabase(app);
const state = { view: new Date(), selected: null, selectedSlot: 'full', calendar: [], prices: { sofa: 1500, chair: 50, bed: 750 } };
const el = id => document.getElementById(id);

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pretty = s => new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${s}T12:00:00`));

function slotLabel(slot) {
  if (slot === 'morning') return "Sabah (12:00'ye kadar)";
  if (slot === 'afternoon') return 'Öğleden sonra (12:00 sonrası)';
  return 'Tam gün';
}

onValue(ref(db, 'pricing'), snap => {
  const p = snap.val() || {};
  if (p.sofa != null) state.prices.sofa = Number(p.sofa) || 1500;
  if (p.chair != null) state.prices.chair = Number(p.chair) || 50;
  if (p.bed != null) state.prices.bed = Number(p.bed) || 750;
  updateEstimate();
}, () => {});

function daySlotState(key) {
  const entries = state.calendar.filter(x => x.booking_date === key);
  const slots = { morning: null, afternoon: null, full: null };
  entries.forEach(e => {
    const st = String(e.status || 'pending').toLowerCase();
    const slot = e.time_slot || 'full';
    if (slot === 'full') {
      slots.full = st;
      if (!slots.morning || slots.morning === 'pending') slots.morning = st;
      if (!slots.afternoon || slots.afternoon === 'pending') slots.afternoon = st;
    } else if (slot === 'morning') {
      if (st === 'approved' || !slots.morning || slots.morning === 'pending') slots.morning = st;
    } else if (slot === 'afternoon') {
      if (st === 'approved' || !slots.afternoon || slots.afternoon === 'pending') slots.afternoon = st;
    }
  });
  if (slots.full === 'approved') { slots.morning = 'approved'; slots.afternoon = 'approved'; }
  return slots;
}

function isSlotAvailable(key, slot) {
  const s = daySlotState(key);
  if (slot === 'full') return s.morning !== 'approved' && s.afternoon !== 'approved' && s.full !== 'approved';
  if (slot === 'morning') return s.morning !== 'approved' && s.full !== 'approved';
  if (slot === 'afternoon') return s.afternoon !== 'approved' && s.full !== 'approved';
  return true;
}

function render() {
  const y = state.view.getFullYear(), m = state.view.getMonth();
  el('monthLabel').textContent = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(state.view);
  const g = el('calendarGrid');
  g.innerHTML = '';
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), off = (first.getDay() + 6) % 7;
  for (let i = 0; i < off; i++) {
    const b = document.createElement('button');
    b.className = 'day empty';
    b.disabled = true;
    g.appendChild(b);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, m, d), key = iso(date);
    const slots = daySlotState(key);
    const b = document.createElement('button');
    b.className = 'day';
    b.innerHTML = `<span class="day-num">${d}</span><span class="day-half top"></span><span class="day-half bottom"></span>`;
    const morningBusy = slots.morning === 'approved' || slots.full === 'approved';
    const afternoonBusy = slots.afternoon === 'approved' || slots.full === 'approved';
    const morningPending = slots.morning === 'pending' && !morningBusy;
    const afternoonPending = slots.afternoon === 'pending' && !afternoonBusy;
    if (date < today) {
      b.classList.add('disabled');
      b.disabled = true;
    } else if (morningBusy && afternoonBusy) {
      b.classList.add('booked');
      b.disabled = true;
    } else {
      if (morningBusy) b.classList.add('half-morning-booked');
      else if (morningPending) b.classList.add('half-morning-pending');
      if (afternoonBusy) b.classList.add('half-afternoon-booked');
      else if (afternoonPending) b.classList.add('half-afternoon-pending');
      if (state.selected === key) b.classList.add('selected');
      b.onclick = () => {
        state.selected = key;
        el('selectedDate').value = key;
        updateSelectedText();
        render();
      };
    }
    g.appendChild(b);
  }
}

function updateSelectedText() {
  if (!state.selected) {
    el('selectedDateText').textContent = 'Henüz tarih seçilmedi';
    return;
  }
  const slot = el('timeSlotSelect')?.value || state.selectedSlot || 'full';
  el('selectedDateText').textContent = `${pretty(state.selected)} · ${slotLabel(slot)}`;
}

el('prevMonth').onclick = () => {
  state.view = new Date(state.view.getFullYear(), state.view.getMonth() - 1, 1);
  render();
};
el('nextMonth').onclick = () => {
  state.view = new Date(state.view.getFullYear(), state.view.getMonth() + 1, 1);
  render();
};
el('timeSlotSelect')?.addEventListener('change', () => {
  state.selectedSlot = el('timeSlotSelect').value;
  updateSelectedText();
});

onValue(ref(db, 'calendar_furniture'), snap => {
  const rows = [];
  snap.forEach(c => {
    const v = c.val() || {};
    rows.push({ id: c.key, ...v, status: String(v.status || 'pending').toLowerCase(), time_slot: v.time_slot || 'full' });
  });
  state.calendar = rows;
  render();
}, err => console.error('Mobilya takvim okunamadı', err));

function getQuantity() {
  const raw = el('quantityInput')?.value;
  const n = parseInt(String(raw ?? '1').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function calcPrice(type, qty) {
  const q = Math.max(1, parseInt(String(qty ?? 1), 10) || 1);
  if (type === 'Koltuk Temizliği') return { total: state.prices.sofa, unit: state.prices.sofa, qty: 1 };
  if (type === 'Sandalye') return { total: state.prices.chair * q, unit: state.prices.chair, qty: q };
  if (type === 'Yatak') return { total: state.prices.bed * q, unit: state.prices.bed, qty: q };
  return { total: 0, unit: 0, qty: 1 };
}

function formatMoney(n) {
  return window.formatTL ? window.formatTL(n) : `${Number(n || 0).toLocaleString('tr-TR')} TL`;
}

function updateEstimate() {
  const type = el('furnitureTypeSelect')?.value;
  const qty = getQuantity();
  const priceEl = el('estimatedPrice');
  if (!priceEl) return;
  if (!type) {
    priceEl.textContent = 'Seçimlerinizi yapın';
    return;
  }
  const est = calcPrice(type, qty);
  if ((type === 'Sandalye' || type === 'Yatak') && est.qty > 1) {
    priceEl.innerHTML = `${formatMoney(est.total)} <small style="font-weight:600;color:#64748b">(${est.qty} × ${formatMoney(est.unit)})</small>`;
  } else {
    priceEl.textContent = formatMoney(est.total);
  }
}

el('furnitureTypeSelect')?.addEventListener('change', () => {
  const type = el('furnitureTypeSelect').value;
  const row = el('quantityRow');
  const qtyInput = el('quantityInput');
  const needsQty = type === 'Sandalye' || type === 'Yatak';
  if (row) {
    row.hidden = !needsQty;
    row.style.display = needsQty ? '' : 'none';
  }
  if (qtyInput) {
    qtyInput.required = needsQty;
    if (!needsQty) qtyInput.value = '1';
  }
  updateEstimate();
});
el('quantityInput')?.addEventListener('input', updateEstimate);
el('quantityInput')?.addEventListener('change', updateEstimate);
el('quantityInput')?.addEventListener('keyup', updateEstimate);

el('bookingForm').onsubmit = async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = el('formMessage');
  msg.textContent = '';

  if (!state.selected) {
    msg.style.color = '#be123c';
    msg.textContent = 'Lütfen önce takvimden bir tarih seçin.';
    return;
  }

  const fd = new FormData(form);
  const timeSlot = fd.get('time_slot') || 'full';
  if (!isSlotAvailable(state.selected, timeSlot)) {
    msg.style.color = '#be123c';
    msg.textContent = 'Seçtiğiniz dilim dolu. Lütfen başka bir tarih veya dilim seçin.';
    return;
  }

  const furnitureType = (fd.get('furniture_type') || '').trim();
  if (!furnitureType) {
    msg.style.color = '#be123c';
    msg.textContent = 'Hizmet türü seçin.';
    return;
  }

  // Adedi her zaman input'tan oku (FormData bazı durumlarda 1 döndürebilir)
  const quantity = (furnitureType === 'Sandalye' || furnitureType === 'Yatak')
    ? getQuantity()
    : 1;
  if ((furnitureType === 'Sandalye' || furnitureType === 'Yatak') && quantity < 1) {
    msg.style.color = '#be123c';
    msg.textContent = 'Lütfen adet girin.';
    return;
  }
  const estimate = calcPrice(furnitureType, quantity);
  const whatsappWindow = window.open('', '_blank');
  const btn = el('submitBooking');
  btn.disabled = true;
  btn.textContent = 'Gönderiliyor...';

  const id = push(ref(db, 'bookings')).key;
  const token = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replaceAll('-', '');

  const booking = {
    booking_date: state.selected,
    time_slot: timeSlot,
    customer_name: fd.get('customer_name')?.trim(),
    phone: fd.get('phone')?.trim(),
    address: fd.get('address')?.trim(),
    property_type: furnitureType,
    room_count: '',
    bathroom_count: 1,
    service_type: furnitureType,
    furniture_type: furnitureType,
    quantity: furnitureType === 'Koltuk Temizliği' ? 1 : quantity,
    notes: fd.get('notes')?.trim() || '',
    status: 'pending',
    created_at: Date.now(),
    approval_token: token,
    sms_notified: false,
    estimated_price: estimate.total,
    price: estimate.total,
    booking_category: 'furniture',
    price_breakdown: estimate
  };

  try {
    await set(ref(db, `bookings/${id}`), booking);
    try {
      await set(ref(db, `calendar_furniture/${id}`), {
        booking_date: state.selected,
        status: 'pending',
        time_slot: timeSlot,
        category: 'furniture'
      });
    } catch (calendarErr) {
      console.warn('Mobilya takvim kaydı yazılamadı:', calendarErr);
    }

    const whatsappNumber = '905431231041';
    const qtyLine = furnitureType !== 'Koltuk Temizliği'
      ? `🔢 Adet: ${booking.quantity} × ${formatMoney(estimate.unit)} = ${formatMoney(estimate.total)}`
      : '';
    const whatsappMessage = [
      '🛋️ *ATOM - Mobilya Rezervasyonu*',
      '',
      `👤 Ad Soyad: ${booking.customer_name || '-'}`,
      `📞 Telefon: ${booking.phone || '-'}`,
      `📅 Tarih: ${pretty(booking.booking_date)}`,
      `⏰ Dilim: ${slotLabel(timeSlot)}`,
      `📍 Adres: ${booking.address || '-'}`,
      `🧽 Hizmet: ${furnitureType}`,
      qtyLine,
      `💰 Toplam: ${formatMoney(estimate.total)}`,
      booking.notes ? `📝 Ek İstek: ${booking.notes}` : '',
      '',
      'Rezervasyon yönetici onayı bekliyor.',
      '',
      '🔐 Yönetici Girişi:',
      'https://misty-lake-95a0.ahmadshafiseddiqi.workers.dev/admin-giris.html'
    ].filter(Boolean).join('\n');

    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;

    msg.style.color = '#15803d';
    msg.textContent = 'Rezervasyon talebiniz alındı. WhatsApp mesajı hazırlanıyor...';

    const priceDetail = (furnitureType === 'Sandalye' || furnitureType === 'Yatak')
      ? `${booking.quantity} × ${formatMoney(estimate.unit)} = ${formatMoney(estimate.total)}`
      : formatMoney(estimate.total);
    el('successPrice').innerHTML =
      `<div class="success-price">
        Fiyatınız: ${priceDetail}<br>
        <small>${pretty(booking.booking_date)} · ${slotLabel(timeSlot)} · ${furnitureType}</small><br>
        <small>Rezervasyon yönetici onayına gönderildi.</small><br><br>
        <a class="btn primary" href="${whatsappUrl}" target="_blank" rel="noopener">WhatsApp'tan Gönder</a>
      </div>`;

    if (whatsappWindow && !whatsappWindow.closed) whatsappWindow.location.href = whatsappUrl;

    form.reset();
    if (el('quantityInput')) el('quantityInput').value = '1';
    if (el('quantityRow')) el('quantityRow').hidden = true;
    if (form.elements.time_slot) form.elements.time_slot.value = 'full';
    state.selected = null;
    state.selectedSlot = 'full';
    el('estimatedPrice').textContent = 'Seçimlerinizi yapın';
    el('selectedDate').value = '';
    el('selectedDateText').textContent = 'Henüz tarih seçilmedi';
    render();
  } catch (err) {
    if (whatsappWindow && !whatsappWindow.closed) whatsappWindow.close();
    console.error('Mobilya rezervasyon kaydı başarısız:', err);
    msg.style.color = '#be123c';
    msg.textContent = 'Rezervasyon gönderilemedi. Lütfen tekrar deneyin.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Rezervasyon Talebi Gönder';
  }
};

render();

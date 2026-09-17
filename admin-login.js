import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

const app = initializeApp(window.EVA_FIREBASE_CONFIG);
const auth = getAuth(app);
const el = id => document.getElementById(id);

onAuthStateChanged(auth, async user => {
  if (!user) return;
  try {
    const token = await user.getIdTokenResult(true);
    if (token.claims.admin === true) location.replace('admin.html');
  } catch {}
});

el('passwordLogin').onclick = async () => {
  const password = el('adminPassword').value;
  const msg = el('loginMessage');
  msg.textContent = '';
  if (!password) { msg.textContent = 'Şifreyi girin.'; return; }

  try {
    const url = window.ATOM_ADMIN_LOGIN_URL;
    if (!url) throw new Error('Yönetici giriş servisi ayarlanmamış.');

    const r = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({password})
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.token) throw new Error(data.error || 'Şifre hatalı.');

    el('adminPassword').value = '';
    await signInWithCustomToken(auth, data.token);
    location.replace('admin.html');
  } catch (e) {
    console.error(e);
    msg.textContent = e?.message || 'Giriş yapılamadı.';
  }
};

el('adminPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') el('passwordLogin').click();
});

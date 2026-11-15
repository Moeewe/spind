/* Passkeys (WebAuthn): Anmelden mit Face ID / Touch ID / Windows Hello – Browserseite.
   Anmeldeseite: Knopf „Mit Passkey anmelden“ und Autofill-Vorschlag im Benutzernamen-Feld.
   Profil: Passkey anlegen (MYFPasskey.register). Server prüft Herausforderung, Adresse und Signatur. */
(function () {
  'use strict';
  function encB(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function decB(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; }
  function post(url, body, nonce) {
    var h = { 'Content-Type': 'application/json' }; if (nonce) h['X-WP-Nonce'] = nonce;
    return fetch(url, { method: 'POST', headers: h, credentials: 'same-origin', body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || 'Fehler ' + r.status); return j; }); });
  }
  function nice(e) {
    var m = String(e && e.message || e || '');
    if (/NotAllowedError|abort|timed out|cancel/i.test(m) || (e && e.name === 'NotAllowedError')) return 'Abgebrochen oder keine Bestätigung am Gerät.';
    if (e && e.name === 'InvalidStateError') return 'Für dieses Konto gibt es auf diesem Gerät schon einen Passkey.';
    return m || 'Fehler';
  }
  window.MYFPasskey = {
    ok: function () { return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext); },
    deviceName: function () {
      var ua = navigator.userAgent;
      return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android-Handy' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows-PC' : 'Dieses Gerät';
    },
    register: function (api, nonce, name) {
      return post(api + 'me/passkey', { do: 'options' }, nonce).then(function (o) {
        o.challenge = decB(o.challenge); o.user.id = decB(o.user.id);
        (o.excludeCredentials || []).forEach(function (c) { c.id = decB(c.id); });
        return navigator.credentials.create({ publicKey: o });
      }).then(function (c) {
        return post(api + 'me/passkey', { do: 'register', name: name, id: c.id, clientDataJSON: encB(c.response.clientDataJSON), attestationObject: encB(c.response.attestationObject),
          transports: c.response.getTransports ? c.response.getTransports() : [] }, nonce);
      }).catch(function (e) { throw new Error(nice(e)); });
    },
    login: function (api, redirect, conditional) {
      return post(api + 'passkey/options', {}).then(function (o) {
        var tok = o.token; o.publicKey.challenge = decB(o.publicKey.challenge);
        var req = { publicKey: o.publicKey }; if (conditional) req.mediation = 'conditional';
        return navigator.credentials.get(req).then(function (c) {
          return post(api + 'passkey/login', { token: tok, id: c.id, clientDataJSON: encB(c.response.clientDataJSON), authenticatorData: encB(c.response.authenticatorData),
            signature: encB(c.response.signature), userHandle: c.response.userHandle ? encB(c.response.userHandle) : '', redirect: redirect || '' });
        });
      }).catch(function (e) { var x = new Error(nice(e)); x.cancel = !!(e && (e.name === 'NotAllowedError' || e.name === 'AbortError')); throw x; });
    }
  };
  // Anmeldeseite
  function mount() {
    var box = document.getElementById('myf-pk-login');
    if (!box || !window.MYFPK) return;
    if (!MYFPasskey.ok()) { box.innerHTML = ''; return; }
    box.innerHTML = '<button type="button" class="myf-pk-btn" id="myf-pk-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:8px" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 20c0-3.5 3-6 7-6 1.4 0 2.7.3 3.8.9"/><circle cx="17.5" cy="14.5" r="2.5"/><path d="M17.5 17v5l1.5-1.5M17.5 20l-1.5-1"/></svg>Mit Passkey anmelden</button><div class="myf-pk-msg" id="myf-pk-msg" aria-live="polite"></div>';
    var msg = document.getElementById('myf-pk-msg'), btn = document.getElementById('myf-pk-btn');
    function go(cond) {
      if (!cond) { btn.disabled = true; msg.textContent = 'Bitte am Gerät bestätigen …'; }
      MYFPasskey.login(MYFPK.api, MYFPK.redirect, cond).then(function (r) { msg.textContent = 'Angemeldet – einen Moment …'; location.href = r.redirect || MYFPK.redirect; },
        function (e) { btn.disabled = false; if (cond && e.cancel) { msg.textContent = ''; return; } msg.textContent = e.message; });
    }
    btn.onclick = function () { go(false); };
    // Autofill: Browser bietet den Passkey direkt im Benutzernamen-Feld an (wenn unterstützt)
    if (window.PublicKeyCredential && PublicKeyCredential.isConditionalMediationAvailable) {
      PublicKeyCredential.isConditionalMediationAvailable().then(function (ok) {
        if (!ok) return;
        var u = document.getElementById('user_login'); if (u) u.setAttribute('autocomplete', 'username webauthn');
        go(true);
      }).catch(function () {});
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();

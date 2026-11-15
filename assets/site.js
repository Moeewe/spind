/* SPIND-Website: Menü am Handy, Untermenüs, Kopfzeile beim Scrollen */
(function () {
  'use strict';
  var top = document.getElementById('ws-top'), nav = document.getElementById('ws-nav'), burger = document.querySelector('.ws-burger');
  if (!top || !nav || !burger) return;
  function setTop() { document.documentElement.style.setProperty('--top-h', Math.max(0, top.getBoundingClientRect().bottom) + 'px'); }
  function open(on) {
    nav.classList.toggle('is-open', on); burger.setAttribute('aria-expanded', on ? 'true' : 'false');
    document.documentElement.classList.toggle('ws-noscroll', on); burger.querySelector('b').textContent = on ? 'Schließen' : 'Menü';
    if (on) setTop();
  }
  burger.addEventListener('click', function () { open(!nav.classList.contains('is-open')); });
  nav.addEventListener('click', function (e) {
    var b = e.target.closest('.ws-subbtn'); if (!b) return;
    var li = b.parentNode, on = !li.classList.contains('is-open');
    li.classList.toggle('is-open', on); b.setAttribute('aria-expanded', on ? 'true' : 'false');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) { open(false); burger.focus(); } });
  window.addEventListener('resize', function () { if (window.innerWidth >= 1080 && nav.classList.contains('is-open')) open(false); setTop(); });
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { top.classList.toggle('is-scrolled', window.scrollY > 8); ticking = false; });
  }, { passive: true });
  setTop();
})();

// Hintergrundvideo im Kopfbereich: nur auf großen Bildschirmen, nicht bei Datensparmodus oder „weniger Bewegung“ – sonst bleibt das Standbild
(function () {
  var v = document.querySelector('.ws-hero-vid'); if (!v) return;
  var c = navigator.connection || {}, mm = window.matchMedia;
  if (c.saveData || /2g/.test(c.effectiveType || '') || (mm && (mm('(prefers-reduced-motion: reduce)').matches || !mm('(min-width: 900px)').matches))) return;
  v.src = v.getAttribute('data-src');
  v.addEventListener('playing', function () { v.classList.add('is-on'); }, { once: true });
  var p = v.play(); if (p && p.catch) p.catch(function () {});
  // Läuft nur, solange es zu sehen ist – spart Akku und Datenvolumen
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { var q = v.play(); if (q && q.catch) q.catch(function () {}); } else v.pause(); }); }).observe(v);
})();

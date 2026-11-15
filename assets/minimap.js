/* Kleine Karte zur Einsatzstelle für die Dashboards (Besprechungsraum, Fahrzeughalle): OpenStreetMap-Kacheln ohne Bibliothek.
   Zeigt Einsatzort (roter Punkt), das Gerätehaus (schwarzes Quadrat, wenn im Ausschnitt) sowie Entfernung und Richtung.
   Nur die Kacheln werden vom OSM-Server geladen – die Adresse selbst verlässt das Haus nicht (Koordinaten kommen aus der Alarmierung). */
(function () {
  'use strict';
  var TILE = 256, URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  function px(lat, lng, z) {
    var n = Math.pow(2, z), r = lat * Math.PI / 180;
    return { x: (lng + 180) / 360 * n * TILE, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n * TILE };
  }
  function dist(a, b, c, d) { // Haversine in km
    var R = 6371, p1 = a * Math.PI / 180, p2 = c * Math.PI / 180, dp = (c - a) * Math.PI / 180, dl = (d - b) * Math.PI / 180;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function bearing(a, b, c, d) {
    var p1 = a * Math.PI / 180, p2 = c * Math.PI / 180, dl = (d - b) * Math.PI / 180;
    var y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    var deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
  }
  var cssDone = false;
  function css() {
    if (cssDone) return; cssDone = true;
    var s = document.createElement('style');
    s.textContent = '.mm{position:relative;overflow:hidden;background:#e6e9e4;border-radius:4px;aspect-ratio:4/3;box-shadow:inset 0 0 0 1px rgba(255,255,255,.45),0 12px 32px rgba(0,0,0,.28)}' +
      // Kacheln einfarbig gedämpft: wirkt wie Teil des Bandes statt wie ein fremdes Fenster; nur der Einsatzort ist rot
      '.mm-in{position:absolute;left:50%;top:50%;width:0;height:0}.mm img{position:absolute;width:256px;height:256px;max-width:none;display:block;pointer-events:none;filter:grayscale(1) contrast(.9) brightness(1.08)}' +
      '.mm-svg{position:absolute;left:50%;top:50%;width:1200px;height:1200px;margin:-600px 0 0 -600px;pointer-events:none}' +
      '.mm-pin{position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:#e30613;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);animation:mm-pulse 1.6s ease-out infinite}' +
      '@keyframes mm-pulse{0%{box-shadow:0 0 0 0 rgba(227,6,19,.6),0 2px 6px rgba(0,0,0,.4)}100%{box-shadow:0 0 0 18px rgba(227,6,19,0),0 2px 6px rgba(0,0,0,.4)}}' +
      '.mm-gh{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;background:#fff;border:3px solid #121518;border-radius:2px;box-shadow:0 1px 4px rgba(0,0,0,.4)}' +
      '.mm-chip{position:absolute;left:10px;bottom:10px;display:inline-flex;align-items:center;gap:7px;background:rgba(18,21,24,.86);color:#fff;font:800 13px/1 "Barlow Condensed",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:7px 10px;border-radius:3px;white-space:nowrap}' +
      '.mm-chip i{width:8px;height:8px;border-radius:50%;background:#e30613;display:inline-block}' +
      '.mm-txt{position:absolute;left:0;right:0;top:0;padding:8px 10px;background:linear-gradient(rgba(18,21,24,.75),rgba(18,21,24,0));color:#fff;font:800 14px/1.2 "Barlow Condensed",system-ui,sans-serif;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.mm-wrap{display:block;width:100%}' +
      '@media (prefers-color-scheme: dark){html:not([data-theme=light]) .mm img{filter:grayscale(1) invert(1) contrast(.85) brightness(.9)}html:not([data-theme=light]) .mm{background:#1c2126}}' +
      'html[data-theme=dark] .mm img{filter:grayscale(1) invert(1) contrast(.85) brightness(.9)}html[data-theme=dark] .mm{background:#1c2126}';
    document.head.appendChild(s);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // MYFMap(lat, lng, { z: 16, station: {lat, lon}, label: 'Musterstraße 1', size: '180px' }) → HTML
  window.MYFMap = function (lat, lng, o) {
    lat = +lat; lng = +lng; o = o || {};
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180 || (!lat && !lng)) return '';
    css();
    var z = o.z || 16, c = px(lat, lng, z), cx = Math.floor(c.x / TILE), cy = Math.floor(c.y / TILE), n = Math.pow(2, z), h = '';
    for (var dx = -2; dx <= 2; dx++) for (var dy = -2; dy <= 2; dy++) {
      var tx = cx + dx, ty = cy + dy; if (ty < 0 || ty >= n) continue;
      h += '<img alt="" loading="lazy" src="' + URL.replace('{z}', z).replace('{x}', ((tx % n) + n) % n).replace('{y}', ty) + '" style="left:' + Math.round(tx * TILE - c.x) + 'px;top:' + Math.round(ty * TILE - c.y) + 'px">';
    }
    var info = '', line = '';
    if (o.station && isFinite(+o.station.lat) && isFinite(+o.station.lon)) {
      var s = px(+o.station.lat, +o.station.lon, z), ox = s.x - c.x, oy = s.y - c.y;
      if (Math.abs(ox) < 2.5 * TILE && Math.abs(oy) < 2.5 * TILE) {
        // Gerätehaus im Ausschnitt: Marker und gestrichelte Linie zur Einsatzstelle
        line = '<svg class="mm-svg" viewBox="0 0 1200 1200"><line x1="' + (600 + ox) + '" y1="' + (600 + oy) + '" x2="600" y2="600" stroke="#121518" stroke-width="3" stroke-dasharray="7 7" opacity=".7"/></svg>';
        h += '<span class="mm-gh" title="Gerätehaus" style="left:' + Math.round(ox) + 'px;top:' + Math.round(oy) + 'px"></span>';
      }
      var km = dist(+o.station.lat, +o.station.lon, lat, lng);
      info = (km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)) + ' km · ' + bearing(+o.station.lat, +o.station.lon, lat, lng);
    }
    return '<div class="mm-wrap"><div class="mm" style="width:' + (o.size || '240px') + (o.ratio ? ';aspect-ratio:' + o.ratio : '') + '"><div class="mm-in">' + h + '</div>' + line + '<span class="mm-pin"></span>' +
      (o.label ? '<div class="mm-txt">' + esc(o.label) + '</div>' : '') + (info ? '<span class="mm-chip"><i></i>' + esc(info) + '</span>' : '') + '</div></div>';
  };
})();

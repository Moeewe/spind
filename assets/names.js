/* SPIND – Vor- und Nachname erkennen („Mustermann Max“, „Max Mustermann“, „ter Horst, Jan“ …).
   Reihenfolge der Hinweise: Komma > E-Mail-Adresse (vorname.nachname@…) > Liste häufiger Vornamen.
   Ohne sicheren Hinweis wird „Nachname Vorname“ angenommen (so stehen Namen meist in Listen) und als unsicher markiert. */
(function () {
  'use strict';
  var FIRST = ('aaron abdul adam adrian ahmet alain albert alessandro alex alexander alexandra alfons alfred ali alice alina alexa aline alisa ' +
    'amelie amir amy ana andre andrea andreas andrej angela angelika anja anke ann anna annabell anne annegret anneliese annette anni annika ' +
    'anton antonia antonius arne arnold artur astrid august axel barbara bastian beate ben benedikt benjamin benno bernd bernhard berta bettina ' +
    'bianca birgit björn bodo boris brigitte bruno burkhard carina carl carla carlo carmen carolin caroline carsten celina charlotte chiara christa ' +
    'christel christian christiane christina christine christoph christopher clara claudia clemens conny constantin cornelia cosima dagmar damian ' +
    'daniel daniela danny david dennis denise detlef diana dieter dietmar dietrich dirk dominik doris dorothea dustin edith eduard egon elena eli ' +
    'elias elisa elisabeth elke ella ellen elmar elsa emil emilia emily emma erich erik erika ernst erwin esther eva ewald fabian fabio falk ' +
    'felix ferdinand finn florian franz franziska frank frauke frederik friedhelm friedrich frieda fritz gabi gabriele georg gerd gerda gerhard ' +
    'gerrit gertrud gisela greta gregor gudrun guido günter günther gustav hanna hannah hannes hans hans-peter hans-jürgen harald harry hartmut ' +
    'heike hein heiner heinrich heinz heinz-josef helena helga helene helmut hendrik henning henrik henry herbert hermann hildegard holger horst hubert ' +
    'hugo ida ilona ilse inga inge ingo ingrid irene iris isabel isabell isabella ivan jakob jan jana janina janine janis jannik jannis jasmin ' +
    'jens jessica joachim jochen johann johanna johannes jonas jonathan josef josefine joshua judith jule julia julian juliane julius jürgen justin ' +
    'jörg jörn kai karin karina karl karl-heinz karsten katarina katharina kathrin katja katrin kerstin kevin kilian kim klara klaus konrad ' +
    'konstantin kristina kurt lara lars laura lea lena leni leo leon leonard leonie levin lilli lina linda linus lisa lothar louis luca lucas ' +
    'lucia ludger ludwig luis luisa luise lukas luka luke lutz lydia magdalena maik malte manfred mara marc marcel marco marcus mareike margarete ' +
    'margret maria marian marie marina mario marion marius mark marko markus marlene marta martha martin martina marvin mathias matthias mats ' +
    'max maxi maximilian mehmet melanie melina merle mia michael michaela michel mika mike milan mila miriam mirko mohammed monika moritz nadine ' +
    'nadja natalie nathalie nele nick nico nicolas nicole niklas nikolas nils nina noah noel norbert ole olaf oliver olga oskar otto pascal ' +
    'patricia patrick paul paula pauline peer peter petra philip philipp pia ralf ralph rainer regina reiner reinhard reinhold renate rene ' +
    'richard rita robert robin roland rolf roman ronja rosa rosemarie rudi rudolf ruth sabine sabrina sandra sara sarah sascha sebastian ' +
    'silke silvia simon simone sina sofia sofie sonja sophia sophie stefan stefanie steffen steffi stephan stephanie susanne svea sven svenja ' +
    'sylvia tanja tatjana theo theresa thilo thomas thorsten tilo tim timo tina tobias tom torben torsten udo ulf ulla ulrich ulrike ursula ' +
    'uta ute uwe valentin vanessa vera verena viktor viktoria vincent volker waldemar walter werner wilfried wilhelm willi wolfgang yannick ' +
    'yvonne zoe ' +
    // ältere Jahrgänge / regionale Namen
    'agnes alois aloys anneliese benedikta bernard bernardus clemens elfriede engelbert egbert ewald franz-josef georg gertrud gisbert heribert ' +
    'hermann-josef hubertus hedwig josefa karl-josef kaspar lambert liesel ludgera margret mechthild meinolf rainer reinhild roswitha theodor ' +
    'theresia thea walburga wigbert wilma winfried ansgar bernadette christoph dorothee gereon hendrik henrike jost kunibert lioba ' +
    'luca leon lennard lennart levi lio luana luisa malia mathilda matteo milo nora oskar paulina pepe romy smilla tilda tjark').split(' ');
  var FIRSTSET = {}; FIRST.forEach(function (n) { FIRSTSET[n] = 1; });
  // Namenszusätze gehören zum Nachnamen (regional häufig: ter, te, to, op de …)
  var PARTICLES = { von: 1, vom: 1, van: 1, der: 1, den: 1, de: 1, ter: 1, te: 1, ten: 1, to: 1, op: 1, zu: 1, zum: 1, zur: 1, 'in': 1, auf: 1, la: 1, le: 1, di: 1, da: 1 };

  function norm(s) {
    return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  }
  function isFirst(w) {
    var l = w.toLowerCase();
    return !!(FIRSTSET[l] || FIRSTSET[l.replace(/-.*$/, '')] || (l.indexOf('-') > 0 && l.split('-').every(function (p) { return FIRSTSET[p]; })));
  }
  function cap(w) { return PARTICLES[w.toLowerCase()] ? w.toLowerCase() : w; }
  function tidy(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  // Ergebnis: { last, first, sure, why }
  function split(raw, email) {
    var s = tidy(raw);
    if (!s) return { last: '', first: '', sure: true, why: '' };
    if (s.indexOf(',') >= 0) {
      var p = s.split(',');
      return { last: tidy(p[0]), first: tidy(p.slice(1).join(' ')), sure: true, why: 'Komma' };
    }
    var w = s.split(' ');
    if (w.length === 1) return { last: w[0], first: '', sure: false, why: 'nur ein Wort' };

    // Zusätze (ter, van der …) an das folgende Wort binden
    var parts = [];
    for (var i = 0; i < w.length; i++) {
      if (PARTICLES[w[i].toLowerCase()] && i < w.length - 1) {
        var j = i, grp = [];
        while (j < w.length - 1 && PARTICLES[w[j].toLowerCase()]) grp.push(cap(w[j++]));
        grp.push(w[j]); parts.push({ t: grp.join(' '), particle: true }); i = j;
      } else parts.push({ t: w[i], particle: false });
    }
    function res(firstIdx, why, sure) {
      var first = parts.filter(function (p, k) { return firstIdx.indexOf(k) >= 0; }).map(function (p) { return p.t; }).join(' ');
      var last = parts.filter(function (p, k) { return firstIdx.indexOf(k) < 0; }).map(function (p) { return p.t; }).join(' ');
      return { last: last, first: first, sure: sure, why: why };
    }
    var n = parts.length, all = []; for (var k = 0; k < n; k++) all.push(k);
    // Ein Teil mit Namenszusatz ist immer der Nachname
    var pi = parts.map(function (p, k) { return p.particle ? k : -1; }).filter(function (k) { return k >= 0; });
    if (pi.length === 1) return res(all.filter(function (k) { return k !== pi[0]; }), 'Namenszusatz', true);

    // 1) E-Mail: vorname.nachname@ / nachname.vorname@ / vnachname@
    var local = String(email || '').split('@')[0];
    if (local) {
      var et = local.split(/[._\-]+/).map(norm).filter(Boolean), pn = parts.map(function (p) { return norm(p.t); });
      if (et.length >= 2) {
        var a = pn.indexOf(et[0]), b = pn.indexOf(et[et.length - 1]);
        if (a >= 0 && b >= 0 && a !== b) return res([a], 'E-Mail', true);
      }
      var whole = norm(local);
      for (var m = 0; m < n; m++) {
        // „mmustermann“ / „mustermannm“: Nachname steckt ganz in der Adresse, der andere Teil nur mit dem Anfangsbuchstaben
        if (pn[m].length > 2 && whole.indexOf(pn[m]) >= 0 && n === 2) {
          var o = 1 - m, rest = whole.replace(pn[m], '');
          if (rest && pn[o].indexOf(rest) === 0) return res([o], 'E-Mail', true);
        }
      }
    }
    // 2) Vornamen-Liste: zusammenhängende bekannte Vornamen am Anfang oder Ende
    var known = parts.map(function (p) { return !p.particle && isFirst(p.t); });
    var lead = 0; while (lead < n - 1 && known[lead]) lead++;
    var trail = 0; while (trail < n - 1 && known[n - 1 - trail]) trail++;
    if (lead && !trail) return res(all.slice(0, lead), 'Vorname erkannt', true);
    if (trail && !lead) return res(all.slice(n - trail), 'Vorname erkannt', true);
    if (lead && trail) {
      // beide Enden sehen wie Vornamen aus (z. B. „Simon Martin“) – Listen stehen meist „Nachname Vorname“
      return res([n - 1], 'unklar – beide Teile sind auch Vornamen', false);
    }
    // 3) Keine Hinweise: „Nachname Vorname“ annehmen
    return res([n - 1], 'angenommen: Nachname zuerst', false);
  }

  window.MYFNames = { split: split, isFirst: isFirst };
})();

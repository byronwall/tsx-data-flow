// Self-contained browser script for the HTML shell.
export const SCRIPT = `
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
  }
  legacyCopy(text);
  return Promise.resolve();
}
function legacyCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (err) {}
  document.body.removeChild(ta);
}

// SHELL-5: reusable custom popover (trigger + floating panel) — the on-page
// replacement for native select elements. Click the trigger to toggle; options are links
// so selecting one navigates (state in the URL, refresh-safe). Closes on outside
// click and Escape. Positioning is CSS-only (absolute panel anchored to the
// trigger's relative wrapper) so every popover behaves identically.
function closeAllPopovers(except) {
  document.querySelectorAll('[data-popover].open').forEach(function (p) {
    if (p === except) return;
    p.classList.remove('open');
    var t = p.querySelector('[data-popover-trigger]');
    if (t) t.setAttribute('aria-expanded', 'false');
  });
}
document.addEventListener('click', function (e) {
  var trigger = e.target.closest
    ? e.target.closest('[data-popover-trigger]')
    : null;
  if (trigger) {
    var pop = trigger.closest('[data-popover]');
    var willOpen = !pop.classList.contains('open');
    closeAllPopovers(pop);
    pop.classList.toggle('open', willOpen);
    trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    e.stopPropagation();
    return;
  }
  if (!(e.target.closest && e.target.closest('[data-popover]')))
    closeAllPopovers(null);
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeAllPopovers(null);
});

// ---- finding selection + path overlay (shared by clicks and initial load) ----
function clearPathOverlay(map) {
  map.querySelectorAll('tr.path-active').forEach(function (r) {
    r.classList.remove('path-active', 'sink-line');
    var tag = r.querySelector('.path-tag'); if (tag) tag.remove();
    var no = r.querySelector('.path-step-no'); if (no) no.remove();
  });
}
// Light up the selected finding's representative path on the source: every hop
// line in this file, with the sink line tagged. Answers "where is this coming
// from / where is it defined" without leaving the code map.
function applyPathOverlay(map, finding) {
  clearPathOverlay(map);
  if (!finding) return;
  (finding.getAttribute('data-path-lines') || '').split(',').filter(Boolean).forEach(function (n) {
    var r = map.querySelector('tr[data-line="' + n + '"]');
    if (r) r.classList.add('path-active');
  });
  var sinkLine = finding.getAttribute('data-sink-line') || '';
  if (sinkLine) {
    var sr = map.querySelector('tr[data-line="' + sinkLine + '"]');
    if (sr) {
      sr.classList.add('path-active', 'sink-line');
      var code = sr.querySelector('td.code');
      if (code && !code.querySelector('.path-tag')) {
        var tag = document.createElement('span');
        tag.className = 'path-tag'; tag.textContent = 'sink';
        code.appendChild(tag);
      }
    }
  }
  // ANNO-1: number each same-file path step in the gutter ("this is item N"),
  // click to re-center. data-path-steps = "line:ordinal[:d],…" (d = defensive).
  (finding.getAttribute('data-path-steps') || '').split(',').filter(Boolean).forEach(function (pair) {
    var bits = pair.split(':');
    var ln = bits[0], ord = bits[1], def = bits[2] === 'd';
    var r = map.querySelector('tr[data-line="' + ln + '"]');
    if (!r) return;
    var gut = r.querySelector('td.gutter');
    if (!gut || gut.querySelector('.path-step-no')) return;
    var badge = document.createElement('span');
    badge.className = 'path-step-no' + (def ? ' def' : '');
    badge.textContent = ord;
    badge.setAttribute('data-line', ln);
    badge.title = 'Path step ' + ord + (def ? ' · defensive' : '');
    gut.appendChild(badge);
  });
}
function flashLine(row) {
  if (!row) return;
  row.classList.add('flash');
  setTimeout(function () { row.classList.remove('flash'); }, 850);
}
function scrollMapToLine(map, line, block) {
  var r = map.querySelector('tr[data-line="' + line + '"]');
  if (r) r.scrollIntoView({ block: block || 'center' });
  return r;
}
// Keep all view state in the query string so a refresh restores the selection.
function syncFindingUrl(id) {
  if (!window.history || !window.history.replaceState) return;
  var url = new URL(window.location.href);
  if (id) url.searchParams.set('finding', id); else url.searchParams.delete('finding');
  window.history.replaceState({}, '', url);
}
function findHit(map, id) {
  return [].slice.call(map.querySelectorAll('.hit')).find(function (h) {
    return (h.getAttribute('data-findings') || '').split(',').indexOf(id) >= 0;
  });
}
// Reveal finding(s) in detail mode, overlay the primary one's path, center its
// source chunk, and reflect it in the URL.
function selectFindings(map, ids) {
  var panel = map.querySelector('.panel');
  if (!panel || !ids.length) return;
  panel.querySelectorAll('.finding').forEach(function (f) { f.classList.remove('active'); });
  var first = null;
  ids.forEach(function (id) {
    var t = panel.querySelector('.finding[data-finding="' + id + '"]');
    if (t) { t.classList.add('active'); if (!first) first = t; }
  });
  if (!first) return;
  panel.classList.add('show-detail');
  first.scrollIntoView({ block: 'nearest' });
  applyPathOverlay(map, first);
  map.querySelectorAll('.hit.sel').forEach(function (h) { h.classList.remove('sel'); });
  var hit = findHit(map, ids[0]);
  if (hit) { hit.classList.add('sel'); hit.scrollIntoView({ block: 'center' }); }
  else { scrollMapToLine(map, first.getAttribute('data-sink-line')); }
  syncFindingUrl(ids[0]);
}
// Return to the findings inventory: clear selection, overlay, and URL state.
function showFindingList(map) {
  var panel = map.querySelector('.panel');
  if (!panel) return;
  panel.classList.remove('show-detail');
  panel.querySelectorAll('.finding').forEach(function (f) { f.classList.remove('active'); });
  map.querySelectorAll('.hit.sel').forEach(function (h) { h.classList.remove('sel'); });
  clearPathOverlay(map);
  syncFindingUrl(null);
}

// Re-sort the inventory list in place (SORT-1): score (worst first) / type / line.
function sortFindingList(fl, mode) {
  var ol = fl.querySelector('ol');
  if (!ol) return;
  var num = function (li, attr) { return parseFloat(li.getAttribute(attr)) || 0; };
  var items = [].slice.call(ol.children);
  items.sort(function (a, b) {
    if (mode === 'line') return num(a, 'data-sort-line') - num(b, 'data-sort-line');
    if (mode === 'sources') {
      return (num(b, 'data-sort-sources') - num(a, 'data-sort-sources'))
        || (num(b, 'data-sort-score') - num(a, 'data-sort-score'));
    }
    if (mode === 'type') {
      return (num(a, 'data-sort-order') - num(b, 'data-sort-order'))
        || (num(a, 'data-sort-line') - num(b, 'data-sort-line'));
    }
    return (num(b, 'data-sort-score') - num(a, 'data-sort-score'))
      || (num(a, 'data-sort-line') - num(b, 'data-sort-line'));
  });
  items.forEach(function (li) { ol.appendChild(li); });
  fl.querySelectorAll('.esort').forEach(function (b) {
    if (b.getAttribute('data-sort') === mode) b.classList.add('active');
    else b.classList.remove('active');
  });
}
function syncSortUrl(mode) {
  if (!window.history || !window.history.replaceState) return;
  var url = new URL(window.location.href);
  if (mode && mode !== 'score') url.searchParams.set('lsort', mode);
  else url.searchParams.delete('lsort');
  window.history.replaceState({}, '', url);
}

document.addEventListener('click', function (e) {
  function closePeeks() {
    document.querySelectorAll('.peek.open').forEach(function (p) { p.classList.remove('open'); });
    document.querySelectorAll('body > .peek-pop.portal').forEach(function (p) { p.remove(); });
  }

  function positionPeek(label, pop) {
    var rect = label.getBoundingClientRect();
    var margin = 10;
    var desiredWidth = Math.min(640, Math.max(360, window.innerWidth - margin * 2));
    pop.style.width = desiredWidth + 'px';
    pop.style.maxWidth = desiredWidth + 'px';
    pop.style.left = '0px';
    pop.style.top = '0px';
    pop.classList.add('open');
    var popRect = pop.getBoundingClientRect();
    var left = Math.min(Math.max(margin, rect.left), window.innerWidth - popRect.width - margin);
    var below = rect.bottom + 8;
    var above = rect.top - popRect.height - 8;
    var top = below + popRect.height + margin <= window.innerHeight
      ? below
      : Math.max(margin, above);
    top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - popRect.height - margin));
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
  }

  // "Copy debug info": dump the finding's full debug payload to the clipboard.
  var copyBtn = e.target.closest('.copy-debug');
  if (copyBtn) {
    var finding = copyBtn.closest('.finding');
    var payload = finding ? finding.querySelector('.debug-payload') : null;
    var text = payload ? payload.textContent : '';
    copyText(text).then(function () {
      var prev = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('ok');
      setTimeout(function () { copyBtn.textContent = prev; copyBtn.classList.remove('ok'); }, 1300);
    });
    e.stopPropagation();
    return;
  }

  // Inline source-peek popover toggle. Close any other open popover first.
  var label = e.target.closest('.peek-label');
  if (label) {
    var peek = label.closest('.peek');
    var pop = peek ? peek.querySelector('.peek-pop') : null;
    var wasOpen = peek && peek.classList.contains('open');
    closePeeks();
    if (peek && pop && !wasOpen) {
      peek.classList.add('open');
      var portal = pop.cloneNode(true);
      portal.classList.add('portal');
      document.body.appendChild(portal);
      positionPeek(label, portal);
    }
    e.stopPropagation();
    return;
  }
  if (!e.target.closest('.peek-pop')) closePeeks();

  // Type-filter chips on the inventory list.
  var efilter = e.target.closest('.efilter');
  if (efilter) {
    var fl = efilter.closest('.finding-list');
    if (fl) {
      fl.querySelectorAll('.efilter').forEach(function (b) { b.classList.remove('active'); });
      efilter.classList.add('active');
      var want = efilter.getAttribute('data-filter');
      fl.querySelectorAll('ol > li').forEach(function (li) {
        var show = want === 'all'
          || (want === 'defended' ? li.getAttribute('data-has-defenses') === '1'
                                  : li.getAttribute('data-type') === want);
        if (show) li.removeAttribute('data-hidden');
        else li.setAttribute('data-hidden', '1');
      });
    }
    return;
  }

  // Sort control on the inventory list (SORT-1): re-order and persist in the URL.
  var esort = e.target.closest('.esort');
  if (esort) {
    var sfl = esort.closest('.finding-list');
    if (sfl) {
      var mode = esort.getAttribute('data-sort');
      sortFindingList(sfl, mode);
      syncSortUrl(mode);
    }
    return;
  }

  // Reveal cross-file code inline (INLINE-1) without leaving the page.
  var reveal = e.target.closest('.reveal-code');
  if (reveal) {
    var peek = reveal.closest('.xfile-peek');
    var inline = peek ? peek.querySelector('.inline-code') : null;
    if (inline) {
      var show = inline.hasAttribute('hidden');
      if (show) inline.removeAttribute('hidden'); else inline.setAttribute('hidden', '');
      reveal.textContent = show ? '⌃ hide' : '⌄ code';
    }
    e.preventDefault();
    return;
  }

  // A numbered path-step badge: scroll its line to center.
  var stepNo = e.target.closest('.path-step-no');
  if (stepNo) {
    var ms = stepNo.closest('.codemap');
    if (ms) flashLine(scrollMapToLine(ms, stepNo.getAttribute('data-line')));
    return;
  }

  // Back to the findings list (close the open detail).
  if (e.target.closest('.panel-back')) {
    var mb = e.target.closest('.codemap');
    if (mb) showFindingList(mb);
    return;
  }

  // A row in the findings inventory: open its detail.
  var fr = e.target.closest('.finding-row');
  if (fr) {
    var mr = fr.closest('.codemap');
    var fid = fr.getAttribute('data-finding');
    if (mr && fid) selectFindings(mr, [fid]);
    return;
  }

  // Same-file "jump to line" link inside a path/defense row.
  var goLine = e.target.closest('.goto-line');
  if (goLine) {
    var mg = goLine.closest('.codemap');
    var gl = goLine.getAttribute('data-line');
    if (mg && gl) flashLine(scrollMapToLine(mg, gl));
    e.preventDefault();
    return;
  }

  // Cross-reference link ("same code — N more"): select that finding.
  var xref = e.target.closest('.xref');
  if (xref) {
    var map0 = xref.closest('.codemap');
    var xid = xref.getAttribute('data-finding');
    if (map0 && xid) selectFindings(map0, [xid]);
    e.preventDefault();
    return;
  }

  // Click a highlighted chunk: reveal ALL findings mapped to that chunk.
  var spot = e.target.closest('.hit');
  if (spot) {
    var map1 = spot.closest('.codemap');
    selectFindings(map1, (spot.getAttribute('data-findings') || '').split(',').filter(Boolean));
    return;
  }

  // Fallback: click anywhere on a finding row to reveal every finding on it.
  var row = e.target.closest('tr.has-sink');
  if (!row) return;
  var map = row.closest('.codemap');
  if (!map) return;
  var ids = [].slice.call(row.querySelectorAll('.hit')).reduce(function (acc, h) {
    (h.getAttribute('data-findings') || '').split(',').forEach(function (id) {
      if (id && acc.indexOf(id) < 0) acc.push(id);
    });
    return acc;
  }, []);
  selectFindings(map, ids);
});

// On load, restore selection from ?finding= (or a server-marked active finding)
// and honor a #L<line> hash from a cross-file jump.
document.addEventListener('DOMContentLoaded', function () {
  var map = document.querySelector('.codemap');
  if (map) {
    var panel = map.querySelector('.panel');
    var active = panel && panel.querySelector('.finding.active');
    if (active) {
      applyPathOverlay(map, active);
      var hit = findHit(map, active.getAttribute('data-finding'));
      if (hit) { hit.classList.add('sel'); hit.scrollIntoView({ block: 'center' }); }
      else { scrollMapToLine(map, active.getAttribute('data-sink-line')); }
    } else {
      var fid = new URLSearchParams(window.location.search).get('finding');
      if (fid) selectFindings(map, [fid]);
    }
    var hashLine = (window.location.hash || '').match(/^#L(\\d+)$/);
    if (hashLine) flashLine(scrollMapToLine(map, hashLine[1]));
    // Restore a non-default list sort from the URL (SORT-1); default is by score,
    // already applied server-side, so only re-sort when ?lsort= says otherwise.
    var lsort = new URLSearchParams(window.location.search).get('lsort');
    if (lsort) {
      var sfl = map.querySelector('.finding-list');
      if (sfl) sortFindingList(sfl, lsort);
    }
  }

  // OVERVIEW-1: column-visibility toggle. Hiding a column adds a class to the
  // table; the choice is remembered in localStorage so a refresh restores it.
  var colToggle = document.getElementById('col-toggle');
  var ovTable = document.getElementById('overview-table');
  if (colToggle && ovTable) {
    var COLS_KEY = 'tsxdf.overviewHiddenCols';
    var hidden = {};
    try { hidden = JSON.parse(localStorage.getItem(COLS_KEY) || '{}') || {}; }
    catch (e) { hidden = {}; }
    var boxes = colToggle.querySelectorAll('input[data-col]');
    var applyCols = function () {
      boxes.forEach(function (box) {
        ovTable.classList.toggle('hide-' + box.getAttribute('data-col'), !box.checked);
      });
    };
    boxes.forEach(function (box) {
      var col = box.getAttribute('data-col');
      if (hidden[col]) box.checked = false;
      box.addEventListener('change', function () {
        hidden[col] = !box.checked;
        try { localStorage.setItem(COLS_KEY, JSON.stringify(hidden)); } catch (e) {}
        applyCols();
      });
    });
    applyCols();
  }
});
`;

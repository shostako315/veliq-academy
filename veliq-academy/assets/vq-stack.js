/* Veliq 共通：スマホ（640px以下）で、細い列に文字が詰まる表を「行ごとの段」に組み替える（2026-11-06）
   - 1行目のセルを太字の見出しにし、3列以上の表は残りのセルの左に列名を小さく添える（列名の列＋値の列の2段組み）
   - 横にスクロールさせる前提の表（枠より広い表）・6列以上の表・入力欄を含む表・計算結果のように後から作られる表には触らない
   - 2026-11-23：見出しの列が短い2列の表（年表・項目と値）は組み替えない（年の列＋本文の列のまま）。空のセルは段に出さない。
     枠より少しだけ広い表は折り返しを許して枠に収める（.vq-fit）。<main> の外の表にも効かせる。
     見た目は各サイトの CSS の末尾「vq-compact」（JS から <style> を足さない。CSP の style-src 'self' のサイトでも同じに効くように） */
(function () {
  if (!window.matchMedia || !matchMedia("(max-width:640px)").matches) return;
  function txt(c) { return (c.textContent || "").replace(/\s+/g, "").length; }
  function run() {
  [].forEach.call(document.querySelectorAll("table"), function (t) {
    if (t.closest("header,nav,footer,[role=presentation]")) return;
    if (t.classList.contains("vq-stk") || t.classList.contains("vt-stack") || t.hasAttribute("data-stack") || t.hasAttribute("data-k2")) return;
    if (t.querySelector("input,select,textarea,button,table")) return;
    var rows = [].slice.call(t.rows); if (rows.length < 2) return;
    var head = t.tHead && t.tHead.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : null;
    if (!head && [].every.call(rows[0].cells, function (c) { return c.tagName === "TH"; }) && rows[0].cells.length > 1) head = rows[0];
    var body = rows.filter(function (r) { return r !== head && !(t.tHead && t.tHead.contains(r)); });
    if (!body.length) return;
    var ncol = Math.max.apply(null, body.map(function (r) { return r.cells.length; }));
    if (ncol < 2 || ncol > 5) return;
    if (body.some(function (r) { return [].some.call(r.cells, function (c) { return c.colSpan > 1 || c.rowSpan > 1; }); })) return;
    /* 2列で左の列が短い（年・項目名）表は、段に組まずに2列のまま見せる */
    if (ncol === 2 && body.every(function (r) { return !r.cells[0] || txt(r.cells[0]) <= 11; })) return;
    /* 狭い列で文字が4行以上に折れているセルがあるときだけ組み替える（数字の短い表はそのまま） */
    var tight = body.some(function (r) {
      return [].some.call(r.cells, function (c) {
        var b = c.getBoundingClientRect(), cs = getComputedStyle(c);
        var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
        return b.width < 120 && txt(c) >= 7 && b.height / lh >= 3.6;
      });
    });
    if (!tight) return;
    var heads = head ? [].map.call(head.cells, function (c) { return (c.textContent || "").trim(); }) : [];
    body.forEach(function (r) {
      [].forEach.call(r.cells, function (c, k) {
        if (k === 0) c.classList.add("vq-stk-h");
        else {
          if (ncol > 2 && heads[k]) c.setAttribute("data-label", heads[k]);
          if (!txt(c) && !c.querySelector("img,svg")) c.classList.add("vq-stk-e");
        }
      });
    });
    if (head && !(t.tHead && t.tHead.contains(head))) head.classList.add("vq-stk-hide");
    t.classList.add("vq-stk");
  });
    fit();
  }
  /* 枠より少し広い表（はみ出しが 5列以上は25%・4列60%・3列80%以内、2列以下は無制限）は、折り返しを許して枠に収める（右の列が切れて表が片側に寄って見えるのを防ぐ。2026-11-23） */
  function fit() {
  [].forEach.call(document.querySelectorAll("table"), function (t) {
    if (t.closest("header,nav,footer,[role=presentation]") || t.querySelector("input,select,textarea,button")) return;
    if (t.classList.contains("vq-stk") || t.classList.contains("vt-stack") || t.classList.contains("vq-fit") || t.hasAttribute("data-stack")) return;
    var box = t.parentElement; if (!box) return;
    var over = function () { return Math.max(t.getBoundingClientRect().width, box.scrollWidth) - box.clientWidth; };
    var ncol = Math.max.apply(null, [].map.call(t.rows, function (r) { return r.cells.length; }).concat([0]));
    var lim = ncol <= 2 ? 9 : ncol === 3 ? 0.8 : ncol === 4 ? 0.6 : 0.25;
    var o = over(); if (o <= 1 || o > box.clientWidth * lim) return;
    t.classList.add("vq-fit");
    /* 収まらない、または文字の多いセルが細すぎて1行2〜3字になるなら元に戻す（横に送る方がまし） */
    var thin = [].some.call(t.querySelectorAll("td"), function (c) { return c.getBoundingClientRect().width < 52 && txt(c) >= 10; });
    if (over() > 1 || thin) t.classList.remove("vq-fit");
  });
  }
  run();
  /* 書体の読み込みや画像で幅が変わったあとにもう一度（組み替え済みの表には触らない） */
  window.addEventListener("load", run);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
})();

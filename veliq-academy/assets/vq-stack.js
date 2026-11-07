/* Veliq 共通：スマホ（640px以下）で、細い列に文字が詰まる表を「行ごとの段」に組み替える（2026-11-06）
   - 1行目のセルを太字の見出しにし、3列以上の表は残りのセルの上に列名を小さく添える
   - 横にスクロールさせる前提の表（枠より広い表）・6列以上の表・入力欄を含む表・計算結果のように後から作られる表には触らない */
(function () {
  if (!window.matchMedia || !matchMedia("(max-width:640px)").matches) return;
  var css = ".vq-stk.vq-stk.vq-stk,.vq-stk.vq-stk.vq-stk tbody,.vq-stk.vq-stk.vq-stk tr,.vq-stk.vq-stk.vq-stk th,.vq-stk.vq-stk.vq-stk td{display:block!important;width:auto!important;min-width:0!important;max-width:none!important}" +
    ".vq-stk.vq-stk.vq-stk{border:0!important}.vq-stk.vq-stk.vq-stk thead,.vq-stk.vq-stk.vq-stk .vq-stk-hide{display:none!important}" +
    ".vq-stk.vq-stk.vq-stk caption{display:block!important;width:auto!important;text-align:left;padding:10px 0 2px}" +
    ".vq-stk.vq-stk.vq-stk tr{padding:14px 0!important;border:0!important;border-bottom:1px solid rgba(0,0,0,.08)!important;background:none!important}" +
    ".vq-stk.vq-stk.vq-stk tr:last-child{border-bottom:0!important}" +
    ".vq-stk.vq-stk.vq-stk th,.vq-stk.vq-stk.vq-stk td{padding:0!important;border:0!important;background:none!important;box-shadow:none!important;position:static!important;text-align:left!important;white-space:normal!important;height:auto!important}" +
    ".vq-stk.vq-stk.vq-stk .vq-stk-h{font-size:15px!important;font-weight:700!important;margin:0 0 6px!important;line-height:1.6}" +
    ".vq-stk.vq-stk.vq-stk td:not(.vq-stk-h),.vq-stk.vq-stk.vq-stk th:not(.vq-stk-h){font-size:14px;line-height:1.75}" +
    ".vq-stk.vq-stk.vq-stk [data-label]{margin-top:8px!important}" +
    ".vq-stk.vq-stk.vq-stk [data-label]::before{content:attr(data-label);display:block;font-size:12px;font-weight:600;opacity:.6;margin:0 0 2px}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  function txt(c) { return (c.textContent || "").replace(/\s+/g, "").length; }
  function run() {
  [].forEach.call(document.querySelectorAll("main table, article table, .wrap table"), function (t) {
    if (t.classList.contains("vq-stk") || t.querySelector("input,select,textarea,button,table")) return;
    var rows = [].slice.call(t.rows); if (rows.length < 2) return;
    var head = t.tHead && t.tHead.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : null;
    if (!head && [].every.call(rows[0].cells, function (c) { return c.tagName === "TH"; }) && rows[0].cells.length > 1) head = rows[0];
    var body = rows.filter(function (r) { return r !== head && !(t.tHead && t.tHead.contains(r)); });
    if (!body.length) return;
    var ncol = Math.max.apply(null, body.map(function (r) { return r.cells.length; }));
    if (ncol < 2 || ncol > 5) return;
    if (body.some(function (r) { return [].some.call(r.cells, function (c) { return c.colSpan > 1 || c.rowSpan > 1; }); })) return;
    /* 横に送る表でも、5列以下で細い列に詰まっていれば段に組み替える（2026-11-07） */
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
        else if (ncol > 2 && heads[k]) c.setAttribute("data-label", heads[k]);
      });
    });
    if (head && !(t.tHead && t.tHead.contains(head))) head.classList.add("vq-stk-hide");
    t.classList.add("vq-stk");
  });
  }
  run();
  /* 書体の読み込みや画像で幅が変わったあとにもう一度（組み替え済みの表には触らない） */
  window.addEventListener("load", run);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
})();

(function () {
  var C = {
    title: "Turbo Kart Rally",
    author: "BridgeMind",
    license: "MIT License (code). All art, models, sounds and music are generated in code (MIT). Fonts: Lilita One and Nunito, SIL OFL 1.1. three.js r170, MIT.",
    source: "https://github.com/bridge-mind/turbo-kart-rally"
  };
  function el(t, css, txt) { var e = document.createElement(t); if (css) e.style.cssText = css; if (txt) e.textContent = txt; return e; }
  var font = "font:13px/1.45 system-ui,sans-serif;";
  var root = el("div", "position:fixed;left:10px;bottom:10px;z-index:2147483647;pointer-events:none;" + font);
  var btn = el("button", "pointer-events:auto;width:26px;height:26px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.45);color:#fff;font:italic bold 14px Georgia,serif;cursor:pointer;opacity:.6;padding:0", "i");
  btn.type = "button";
  btn.setAttribute("aria-label", "Credits");
  var panel = el("div", "pointer-events:auto;display:none;position:absolute;left:0;bottom:34px;width:300px;max-width:80vw;padding:12px 14px;border-radius:8px;background:rgba(10,12,24,.88);color:#eee;box-shadow:0 4px 16px rgba(0,0,0,.4);user-select:text;-webkit-user-select:text");
  panel.appendChild(el("div", "font-weight:700;font-size:15px;margin-bottom:4px", C.title));
  panel.appendChild(el("div", "", "By " + C.author));
  panel.appendChild(el("div", "margin-top:4px;opacity:.85", C.license));
  panel.appendChild(el("div", "margin-top:4px;opacity:.85;word-break:break-all", "Source: " + C.source));
  panel.appendChild(el("div", "margin-top:8px;opacity:.7;font-size:12px", "Added to Patch by Patch. The author can claim it."));
  btn.onclick = function () { panel.style.display = panel.style.display === "none" ? "block" : "none"; btn.blur(); };
  ["keydown", "keyup", "keypress", "mousedown", "mouseup", "click", "pointerdown", "pointerup", "touchstart", "touchend", "wheel", "contextmenu", "dblclick"].forEach(function (n) {
    [btn, panel].forEach(function (t) { t.addEventListener(n, function (e) { e.stopPropagation(); }); });
  });
  root.appendChild(panel);
  root.appendChild(btn);
  (document.body || document.documentElement).appendChild(root);
})();

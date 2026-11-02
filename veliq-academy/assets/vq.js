/* スマホのメニュー（Finance と同じ動き） */
(function(){var b=document.getElementById("navBurger"),m=document.getElementById("navMenu");if(!b||!m)return;
function set(o){b.setAttribute("aria-expanded",o?"true":"false");m.classList.toggle("open",o);document.documentElement.style.overflow=o?"hidden":""}
b.addEventListener("click",function(){set(b.getAttribute("aria-expanded")!=="true")});
m.addEventListener("click",function(e){if(e.target.closest("a"))set(false)});
document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false)});
})();
/* 図（題名の上の画像など）が読めなかったら figure ごと隠す（CSP で onerror 属性は使えないのでここで） */
(function(){function hide(img){var f=img.closest("figure");(f||img).style.display="none"}
document.querySelectorAll("figure img").forEach(function(img){if(img.complete&&img.naturalWidth===0)hide(img);else img.addEventListener("error",function(){hide(img)})});
})();

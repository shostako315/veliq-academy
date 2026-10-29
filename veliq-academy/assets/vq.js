/* スマホのメニュー（Finance と同じ動き） */
(function(){var b=document.getElementById("navBurger"),m=document.getElementById("navMenu");if(!b||!m)return;
function set(o){b.setAttribute("aria-expanded",o?"true":"false");m.classList.toggle("open",o);document.documentElement.style.overflow=o?"hidden":""}
b.addEventListener("click",function(){set(b.getAttribute("aria-expanded")!=="true")});
m.addEventListener("click",function(e){if(e.target.closest("a"))set(false)});
document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false)});
})();

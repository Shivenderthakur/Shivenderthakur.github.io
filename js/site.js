/* Marks the section you are currently reading in the masthead. */
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll(".masthead nav a"));
  if (!links.length || typeof IntersectionObserver !== "function") return;

  var map = new Map();
  links.forEach(function (a) {
    var section = document.querySelector(a.getAttribute("href"));
    if (section) map.set(section, a);
  });

  var visible = new Set();

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) visible.add(e.target);
      else visible.delete(e.target);
    });

    links.forEach(function (a) { a.removeAttribute("aria-current"); });

    var first = null;
    map.forEach(function (a, section) {
      if (visible.has(section) && (!first || section.offsetTop < first.offsetTop)) first = section;
    });
    if (first) map.get(first).setAttribute("aria-current", "true");
  }, { rootMargin: "-25% 0px -60% 0px" });

  map.forEach(function (a, section) { io.observe(section); });
})();

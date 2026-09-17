document.addEventListener("DOMContentLoaded", () => {
  const progress = document.createElement("div");
  progress.className = "scroll-progress";
  document.body.appendChild(progress);

  document.querySelectorAll("section, .service-card, .method-card, .work-card, .reviews article, .price-card, .policy-card, .team-card")
    .forEach(el => el.classList.add("reveal"));

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });

  // Hafif gecikmeli (stagger) görünüm
  document.querySelectorAll(".reveal").forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i % 6, 5) * 0.06}s`;
    io.observe(el);
  });

  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
  };
  updateProgress();
  addEventListener("scroll", updateProgress, { passive: true });

  // Fiyat kutusu güncellenince hafif vurgu
  const priceEl = document.getElementById("estimatedPrice");
  if (priceEl) {
    const mo = new MutationObserver(() => {
      const box = priceEl.closest(".live-price");
      if (!box) return;
      box.classList.add("updated");
      clearTimeout(box._t);
      box._t = setTimeout(() => box.classList.remove("updated"), 450);
    });
    mo.observe(priceEl, { childList: true, characterData: true, subtree: true });
  }
});

window.addEventListener("load", () => {
  setTimeout(() => document.querySelector(".site-loader")?.classList.add("hide"), 450);
});

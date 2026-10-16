(() => {
  const param = new URLSearchParams(window.location.search).get("scoutTheme");
  const theme =
    param || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
})();

(() => {
  const requested = new URLSearchParams(window.location.search).get("scoutTheme");
  document.documentElement.setAttribute(
    "data-theme",
    ["ignite", "light", "dark"].includes(requested) ? requested : "ignite",
  );
})();

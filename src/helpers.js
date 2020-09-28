export function ready(fn) {
  if (document.readyState != 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

export function selectorValue(select_obj) {
    return select_obj.options[select_obj.selectedIndex].value;
}

export function toggleCheckbox(checkbox) {
    checkbox.checked = !checkbox.checked;
    if ("createEvent" in document) {
        let evt = document.createEvent("HTMLEvents");
        evt.initEvent("change", false, true);
        checkbox.dispatchEvent(evt);
    } else {
        checkbox.fireEvent("onchange");
    }
}

export function pageHidden(def = true) {
  // https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
  for (let hidden of ["hidden", "msHidden", "webkitHidden"]) {
    if (typeof document[hidden] !== "undefined") {
      return document[hidden];
    }
  }
  return def;
}

import {emoLevels, emoLookup, getEmoLevel} from './game-data.mjs';

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

export function capFirst(s) {
  return `${s[0].toUpperCase()}${s.slice(1)}`;
}


export function fillKnightKindSelector(select, selectedKind) {
  let choseAnOption = false;
  for (let emo of Object.keys(emoLookup).sort()) {
    let o = document.createElement('option');
    o.setAttribute("value", emo);
    o.innerHTML = capFirst(emo);
    if (selectedKind == emo) {
      o.setAttribute("selected", true);
      choseAnOption = true;
    }
    select.append(o);
  }
  if (!choseAnOption) {
    let o = document.createElement('option');
    o.innerHTML = "Choose one";
    o.setAttribute("selected", true);
    o.setAttribute("disabled", true);
    select.prepend(o);
  }
}

export function fillKnightLevelSelector(select, emoKind, selectedLevel) {
  for (let i of Object.keys(emoLevels).sort()) {
    let o = document.createElement('option');
    o.setAttribute("value", i);
    o.innerHTML = `${i}: ${capFirst(getEmoLevel(emoKind, i))}`;
    if (selectedLevel == i) {
      o.setAttribute("selected", true);
    }
    select.append(o);
  }
}

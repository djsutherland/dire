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

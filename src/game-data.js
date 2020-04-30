const sidesByKind = {
  none: 0,
  dictator: 4,
  d6: 6,
  bad: 6,
  fallen: 0,
  fool: 6,
  knight: 8,
  neo: 10,
  godbinder: 12,
  master: 20
};

const classNames = {
  dictator: "the Dictator",
  fool: "the Fool",
  fallen: "a Fallen",
  knight: "the Emotion Knight",
  neo: "the Neo",
  godbinder: "the Godbinder",
  master: "the Master"
};

const foolEffects11 = {
  X: "Disarm a foe",
  O: "Knock a foe over; they lose all guard",
  V: "Inspire all allies to get advantage next round",
};

exports.sidesByKind = sidesByKind;
exports.classNames = classNames;
exports.foolEffects11 = foolEffects11;

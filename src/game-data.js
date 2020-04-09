const sidesByKind = {
  none: 0,
  dictator: 4,
  d6: 6,
  bad: 6,
  fallen: 0,
  fool: 6,
  fool_nodie: 0,
  knight: 8,
  neo: 10,
  godbinder: 12,
  master: 20
};

const classNames = {
  dictator: "the Dictator",
  fool: "the Fool",
  fool_nodie: "the Fool, but the GM has your die",
  fallen: "a Fallen",
  knight: "the Emotion Knight",
  neo: "the Neo",
  godbinder: "the Godbinder",
  master: "the Master"
};

exports.sidesByKind = sidesByKind;
exports.classNames = classNames;

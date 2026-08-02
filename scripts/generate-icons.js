const fs = require('fs');
const path = require('path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const {
  FaAppleWhole,
  FaArrowLeft,
  FaArrowRight,
  FaArrowsRotate,
  FaBed,
  FaBowlFood,
  FaBottleWater,
  FaBreadSlice,
  FaCalendarDays,
  FaCamera,
  FaCarrot,
  FaChartColumn,
  FaCheck,
  FaCircleExclamation,
  FaClipboardList,
  FaDumbbell,
  FaFilePen,
  FaFloppyDisk,
  FaFire,
  FaHandsClapping,
  FaHouse,
  FaImage,
  FaLeaf,
  FaList,
  FaMagnifyingGlass,
  FaPalette,
  FaPause,
  FaPenToSquare,
  FaPlay,
  FaPlus,
  FaQrcode,
  FaRightFromBracket,
  FaRulerCombined,
  FaSeedling,
  FaSignal,
  FaSliders,
  FaStopwatch,
  FaTrashCan,
  FaTriangleExclamation,
  FaUser,
  FaWeightScale,
  FaWheatAwn,
  FaXmark,
  FaClipboard,
} = require('react-icons/fa6');
const { CgGym } = require('react-icons/cg');

const ICONS = {
  apple: FaAppleWhole,
  arrowLeft: FaArrowLeft,
  arrowRight: FaArrowRight,
  arrowsRotate: FaArrowsRotate,
  bed: FaBed,
  bowlFood: FaBowlFood,
  bottleWater: FaBottleWater,
  bread: FaBreadSlice,
  calendar: FaCalendarDays,
  camera: FaCamera,
  carrot: FaCarrot,
  chart: FaChartColumn,
  check: FaCheck,
  close: FaXmark,
  clipboard: FaClipboardList,
  clapping: FaHandsClapping,
  dumbbell: FaDumbbell,
  edit: FaPenToSquare,
  error: FaCircleExclamation,
  filePen: FaFilePen,
  fire: FaFire,
  save: FaFloppyDisk,
  house: FaHouse,
  image: FaImage,
  leaf: FaLeaf,
  list: FaList,
  magnify: FaMagnifyingGlass,
  palette: FaPalette,
  pause: FaPause,
  play: FaPlay,
  plus: FaPlus,
  qrcode: FaQrcode,
  logout: FaRightFromBracket,
  ruler: FaRulerCombined,
  seedling: FaSeedling,
  signal: FaSignal,
  sliders: FaSliders,
  stopwatch: FaStopwatch,
  trash: FaTrashCan,
  warning: FaTriangleExclamation,
  user: FaUser,
  weightScale: FaWeightScale,
  wheat: FaWheatAwn,
  gym: CgGym,
};

function toSvg(Component) {
  return renderToStaticMarkup(
    React.createElement(Component, {
      className: 'agoge-icon',
      'aria-hidden': 'true',
      focusable: 'false'
    })
  );
}

const serializedIcons = Object.fromEntries(
  Object.entries(ICONS).map(([name, Component]) => [name, toSvg(Component)])
);

const output = `/* eslint-disable */\n(function () {\n  window.AgogeIcons = Object.freeze(${JSON.stringify(serializedIcons, null, 2)});\n\n  window.agogeIcon = function (name) {\n    return window.AgogeIcons[name] || '';\n  };\n\n  window.agogeHydrateIcons = function (root) {\n    const scope = root || document;\n    scope.querySelectorAll('[data-icon]').forEach((node) => {\n      const iconName = node.getAttribute('data-icon');\n      node.innerHTML = window.agogeIcon(iconName);\n    });\n  };\n\n  if (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', () => window.agogeHydrateIcons());\n  } else {\n    window.agogeHydrateIcons();\n  }\n})();\n`;

const target = path.join(__dirname, '..', 'public', 'js', 'icons.js');
fs.writeFileSync(target, output, 'utf8');
console.log(`Generated ${target}`);

import { s as styles_default, c as classRenderer_v3_unified_default, a as classDiagram_default, C as ClassDB } from "./chunk-JBRWN2VN.js";
import { _ as __name } from "./mermaid.core.js";
import "./chunk-GLLZNHP4.js";
import "./chunk-WVR4S24B.js";
import "./chunk-NRVI72HA.js";
import "./sidepanel.js";
import "./index.js";
var diagram = {
  parser: classDiagram_default,
  get db() {
    return new ClassDB();
  },
  renderer: classRenderer_v3_unified_default,
  styles: styles_default,
  init: /* @__PURE__ */ __name((cnf) => {
    if (!cnf.class) {
      cnf.class = {};
    }
    cnf.class.arrowMarkerAbsolute = cnf.arrowMarkerAbsolute;
  }, "init")
};
export {
  diagram
};
//# sourceMappingURL=classDiagram-v2-QTMF73CY.js.map

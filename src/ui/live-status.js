import { i18n } from "../i18n.js";

function announceStatus(key) {
    const region = document.getElementById("live-status");
    if (region) region.textContent = i18n.t(key);
}

export { announceStatus };

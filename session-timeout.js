const PAGE_REFRESH_MS = 2 * 60 * 1000;
const LOGOUT_TIMEOUT_MS = 20 * 60 * 1000;
const WARNING_MS = 30 * 1000;

let pageRefreshTimer = null;
let logoutTimer = null;
let warningTimer = null;

function logoutForInactivity() {
    localStorage.clear();
    window.location.href = "login.html?timeout=1";
}

function showSessionWarning() {
    const existingWarning = document.getElementById("sessionTimeoutWarning");

    if (existingWarning) {
        return;
    }

    const warning = document.createElement("div");
    warning.id = "sessionTimeoutWarning";
    warning.className = "session-timeout-warning";
    warning.innerHTML = `
        <strong>Sayfa yakında yenilenecek.</strong>
        <span>Devam etmek için sayfada herhangi bir işlem yapın.</span>
    `;

    document.body.appendChild(warning);
}

function hideSessionWarning() {
    const warning = document.getElementById("sessionTimeoutWarning");

    if (warning) {
        warning.remove();
    }
}

function resetSessionTimeout() {
    window.clearTimeout(pageRefreshTimer);
    window.clearTimeout(logoutTimer);
    window.clearTimeout(warningTimer);
    hideSessionWarning();

    warningTimer = window.setTimeout(
        showSessionWarning,
        PAGE_REFRESH_MS - WARNING_MS
    );
    pageRefreshTimer = window.setTimeout(
        () => window.location.reload(),
        PAGE_REFRESH_MS
    );
    logoutTimer = window.setTimeout(
        logoutForInactivity,
        LOGOUT_TIMEOUT_MS
    );
}

[
    "click",
    "keydown",
    "mousemove",
    "scroll",
    "touchstart",
    "input",
    "change"
].forEach(eventName => {
    window.addEventListener(eventName, resetSessionTimeout, { passive: true });
});

window.addEventListener("storage", resetSessionTimeout);
window.addEventListener("DOMContentLoaded", resetSessionTimeout);

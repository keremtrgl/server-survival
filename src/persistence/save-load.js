// Save/load system (#155 PR 6): save modal, serialization to localStorage or
// downloaded file, old-save migration, and full state restore (services,
// connections, finances, UI sync). Code moved verbatim from game.js; game.js
// keeps thin window.x = importedX assignments in its ESM-boundary block.

import { STATE } from "../state.js";
import { resetMetrics } from "../core/metrics.js";
import { beginRunEpoch, disposeRunScene } from "../core/run-lifecycle.js";
import { resetResilience } from "../sim/circuit-breaker.js";
import { i18n } from "../i18n.js";
import { clearFailureBadges } from "../ui/failure-badges.js";
// Achievements (#158): loading a save is a session boundary — baselines must
// re-capture from the RESTORED board (elapsedGameTime is restored below but
// STATE.failures is not), or a restored 300s save would instantly satisfy
// every time/cleanliness benchmark with zero live play.
import { achievements } from "../achievements/achievements.js";
import { updateScoreUI } from "../core/actions.js";
import { updateRepairCostTable } from "../core/economy.js";
import { recomputePower } from "../sim/power.js";
import { createConnection, restoreService } from "../sim/topology.js";
import { isSaveFileSizeAllowed, normalizeSaveData } from "./save-validation.js";
// Runtime-only cycle (game.js ⇄ save-load.js) — established pattern: these
// are hoisted function declarations / top-level consts in game.js, only
// dereferenced at runtime, long after both modules evaluate.
import {
    animate,
    connectionGroup,
    normalizeBurstCount,
    normalizeSandboxRps,
    requestGroup,
    serviceGroup,
    setHudModeTitle,
    syncInput,
} from "../../game.js";

// Function to show save modal (triggered from UI)
function showSaveModal() {
    const modal = document.getElementById("save-modal");
    if (modal) {
        modal.classList.remove("hidden");
    }
}

// Function to close save modal (triggered from UI)
function closeSaveModal() {
    const modal = document.getElementById("save-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
}

// Function to save game state to localStorage or download as file (triggered from UI inside save modal)
function saveGameState(saveAs = "browser") {
    try {
        const saveData = {
            timestamp: Date.now(),
            version: "2.0",
            ...STATE,
            score: { ...STATE.score },
            trafficDistribution: { ...STATE.trafficDistribution },
            services: STATE.services.map((service) => ({
                id: service.id,
                type: service.type,
                position: [service.position.x, service.position.y, service.position.z],
                connections: [...service.connections],
                tier: service.tier,
                cacheHitRate: service.config.cacheHitRate || null,
                // ASG (#195): the enabled flag and the READY fleet size.
                // Warming instances are dropped on purpose — see the note in
                // Service.restore. Old saves lack both and restore as
                // (false, 1).
                asgEnabled: !!service.asgEnabled,
                instances: service.instances || 1,
            })),
            connections: STATE.connections.map((conn) => ({
                from: conn.from,
                to: conn.to,
            })),
            requests: [],
            internetConnections: [...STATE.internetNode.connections],
        };

        if(saveAs === "file")
            downloadSaveFile(saveData);
        else
            localStorage.setItem("serverSurvivalSave", JSON.stringify(saveData));

        const saveBtn = document.getElementById("btn-save");
        const originalColor = saveBtn.classList.contains("hover:border-green-500")
            ? ""
            : saveBtn.style.borderColor;
        saveBtn.style.borderColor = "#10b981"; // green-500
        saveBtn.style.color = "#10b981";
        setTimeout(() => {
            saveBtn.style.borderColor = originalColor;
            saveBtn.style.color = "";
        }, 1000);

        STATE.sound.playPlace(); // Use place sound as feedback
        window.closeSaveModal();
    } catch (error) {
        console.error("Failed to save game:", error);
        alert(i18n.t('save_failed'));
    }
}

// Function to download save data as a file
function downloadSaveFile(saveData) {

    const blob = new Blob([JSON.stringify(saveData)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace(',', '');
    a.download = `ServerSurvival-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

}

function onSaveGameFileUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        alert(i18n.t('no_file_selected'));
        return;
    }
    if (!isSaveFileSizeAllowed(file.size)) {
        event.target.value = "";
        alert(i18n.t('load_failed_corrupted'));
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            let saveData = JSON.parse(e.target.result);
            if (loadGameState(saveData)) {
                STATE.sound.playPlace(); // Use place sound as feedback
            }
        } catch (error) {
            console.error("Failed to load game:", error);
            alert(i18n.t('load_failed_corrupted'));
        }
    };
    reader.readAsText(file);
    // Reset the input value to allow uploading the same file again if needed
    event.target.value = "";
}

// Function to load game state from localStorage (triggered from UI) or provided save data (provided from uploaded file)
function onClickContinueGame() {
    loadGameState();
}

function loadGameState(saveData) {
    try {
        // Only an omitted argument means "load from browser". An explicit
        // null/undefined is untrusted parsed input and must fail validation.
        if(arguments.length === 0){
            const saveDataStr = localStorage.getItem("serverSurvivalSave");
            if (!saveDataStr) {
                alert(i18n.t('no_save_found_msg'));
                return false;
            }

            saveData = JSON.parse(saveDataStr);

        }

        const normalizedSave = normalizeSaveData(saveData);
        if (!normalizedSave) {
            alert(i18n.t('load_failed_corrupted'));
            return false;
        }
        saveData = normalizedSave;

        clearCurrentGame();

        STATE.money = saveData.money;
        STATE.reputation = saveData.reputation;
        STATE.requestsProcessed = saveData.requestsProcessed;
        // The counters that PAIR with requestsProcessed. saveGameState()
        // spreads ...STATE, so all three have always been in the file — the
        // load simply never read them back, while requestsProcessed jumped to
        // the save's value. The abandoned session's tallies stayed, and
        // getRunReport's `onTime: max(0, processed - late)` then printed a
        // debrief that contradicts itself: "Served 0 of 5 (0% on time) - 40
        // late", forty late answers out of five requests.
        //
        // Fresh objects, not the parsed ones: STATE must not alias a blob the
        // next save spreads back out. Old saves lack the keys and restore as
        // a clean slate, which is the same thing resetGame would have given
        // them.
        STATE.lateCompletions = saveData.lateCompletions;
        STATE.failures = {
            STATIC: 0, READ: 0, WRITE: 0, UPLOAD: 0,
            SEARCH: 0, MALICIOUS: 0, INFERENCE: 0,
            ...saveData.failures,
        };
        STATE.failuresByReason = { ...saveData.failuresByReason };
        STATE.failuresDismissedAt = saveData.failuresDismissedAt;
        // A spread of undefined is {} (truthy), so `|| default` never fired —
        // an old save without this field got {} and NaN'd the score math.
        STATE.score = { ...saveData.score };
        STATE.activeTool = saveData.activeTool;
        STATE.selectedNodeId = saveData.selectedNodeId;
        STATE.lastTime = performance.now(); // Reset timing
        STATE.spawnTimer = saveData.spawnTimer;
        STATE.currentRPS = normalizeSandboxRps(saveData.currentRPS);
        STATE.timeScale = saveData.timeScale;
        STATE.elapsedGameTime = saveData.elapsedGameTime;
        STATE.isRunning = saveData.isRunning;
        STATE.gameStartTime = performance.now();

        STATE.gameMode = saveData.gameMode;
        setHudModeTitle(STATE.gameMode);

        // A SAVE IS A DIFFERENT RUN, so the campaign stops here — the same
        // rule resetGame() follows, for the same reason and one path short of
        // it. This module never saved or restored campaign state, but nothing
        // shut the controller down either: Escape opens the pause menu during
        // a level, "Continue Game" is offered whenever a save exists, and the
        // load replaced the board while window.campaign kept grading it.
        //
        // The level's constraints go with the board it graded. Level 15 hands
        // the player $190 and a monitor-only palette; a sandbox save carrying
        // $4300 and a three-Compute fleet was graded against level 15's
        // objectives and won it. Both the budget and allowedServices are
        // bypassed, the palette gate being UI-only.
        // The rolling windows cannot be restored — a ring buffer of the last
        // thirty seconds is not in the file, and showing the ABANDONED
        // session's last thirty seconds next to a resumed board is worse than
        // showing nothing. resetGame calls both of these; the load path called
        // neither, so goodput, the service peaks and the breaker state all
        // carried over from a run the player walked away from.
        resetMetrics();
        resetResilience();

        window.campaign?.exit();
        STATE.campaign.level = null;
        STATE.campaign.currentLevelId = null;
        STATE.sandboxBudget = saveData.sandboxBudget;
        STATE.upkeepEnabled = saveData.upkeepEnabled;
        // Same dead-fallback pattern as score above: spread of undefined is {}.
        STATE.trafficDistribution = { ...saveData.trafficDistribution };
        // AI Wave session counter (#87). Old saves lack the field → fresh 0.
        STATE.inference = { expired: saveData.inference.expired };
        STATE.burstCount = normalizeBurstCount(saveData.burstCount);
        STATE.gameStarted = saveData.gameStarted;
        STATE.previousTimeScale = saveData.previousTimeScale;

        // Initialize intervention state for survival mode mechanics
        if (STATE.gameMode === "survival") {
            STATE.intervention = {
                trafficShiftTimer: 0,
                trafficShiftActive: false,
                currentShift: null,
                originalTrafficDist: null,
                randomEventTimer: 0,
                activeEvent: null,
                eventEndTime: 0,
                currentMilestoneIndex: 0,
                rpsMultiplier: 1.0,
                recentEvents: [],
                warnings: [],
                costMultiplier: 1.0,
                trafficBurstMultiplier: 1.0,
            };
            STATE.maliciousSpikeTimer = 0;
            STATE.maliciousSpikeActive = false;
            STATE.normalTrafficDist = null;
            STATE.autoRepairEnabled = saveData.autoRepairEnabled;
        }

        // Restore finances from the save (fall back to zeroed defaults for older
        // saves that predate finance tracking). Previously this always reset to
        // zero, so every reload wiped the player's income/expense history even
        // though saveGameState had written it to disk.
        STATE.finances = saveData.finances;

        restoreServices(saveData.services);
        // Power grid (#87): re-derive after the restore loop — spec-listed
        // call site (restoreServices does it too; the recompute is idempotent).
        recomputePower();

        const autoRepairBtn = document.getElementById("auto-repair-toggle");
        if (autoRepairBtn) {
            if (STATE.autoRepairEnabled) {
                autoRepairBtn.textContent = i18n.t('upkeep_on');
                autoRepairBtn.classList.remove("text-gray-400");
                autoRepairBtn.classList.add("text-green-400");
            } else {
                autoRepairBtn.textContent = i18n.t('upkeep_off');
                autoRepairBtn.classList.remove("text-green-400");
                autoRepairBtn.classList.add("text-gray-400");
            }
        }
        updateRepairCostTable();

        restoreConnections(
            saveData.connections,
            saveData.internetConnections
        );

        updateScoreUI();
        document.getElementById("money-display").innerText = `$${Math.floor(
            STATE.money
        )}`;
        document.getElementById("rep-bar").style.width = `${Math.max(
            0,
            STATE.reputation
        )}%`;
        document.getElementById(
            "rps-display"
        ).innerText = `${STATE.currentRPS.toFixed(1)} ${i18n.t('req_per_sec')}`;

        const sandboxPanel = document.getElementById("sandboxPanel");
        const objectivesPanel = document.getElementById("objectivesPanel");

        if (STATE.gameMode === "sandbox") {
            if (sandboxPanel) sandboxPanel.classList.remove("hidden");
            if (objectivesPanel) objectivesPanel.classList.add("hidden");
            syncInput("budget", STATE.sandboxBudget);
            syncInput("rps", STATE.currentRPS);
            syncInput("static", (STATE.trafficDistribution.STATIC || 0) * 100);
            syncInput("read", (STATE.trafficDistribution.READ || 0) * 100);
            syncInput("write", (STATE.trafficDistribution.WRITE || 0) * 100);
            syncInput("upload", (STATE.trafficDistribution.UPLOAD || 0) * 100);
            syncInput("search", (STATE.trafficDistribution.SEARCH || 0) * 100);
            syncInput("malicious", (STATE.trafficDistribution.MALICIOUS || 0) * 100);
            syncInput("inference", (STATE.trafficDistribution.INFERENCE || 0) * 100);
            syncInput("burst", STATE.burstCount);
            const upkeepBtn = document.getElementById("upkeep-toggle");
            if (upkeepBtn) {
                upkeepBtn.textContent = STATE.upkeepEnabled
                    ? i18n.t('upkeep_on_label')
                    : i18n.t('upkeep_off_label');
                upkeepBtn.classList.toggle("bg-red-900/50", STATE.upkeepEnabled);
                upkeepBtn.classList.toggle("bg-green-900/50", !STATE.upkeepEnabled);
            }
        } else {
            if (sandboxPanel) sandboxPanel.classList.add("hidden");
            // ...and NOT un-hidden: this branch used to reveal the objectives
            // panel for any non-sandbox save, which after the shutdown above
            // means revealing the last level's goals over a run that is not
            // playing it. A save has no campaign in it to show.
            if (objectivesPanel) objectivesPanel.classList.add("hidden");
        }

        document.getElementById("main-menu-modal").classList.add("hidden");

        // Achievements (#158): session boundary — AFTER elapsedGameTime and
        // the board are restored, so the poll baselines read the loaded run.
        achievements.onSessionStart();

        if (!STATE.animationId) {
            animate(performance.now());
        }

        STATE.sound.playPlace();
        return true;
    } catch (error) {
        console.error("Failed to load game:", error);
        alert(i18n.t('load_failed_corrupted'));
        return false;
    }
}

function clearCurrentGame() {
    STATE.runEpoch = beginRunEpoch();
    disposeRunScene({
        services: STATE.services,
        requests: STATE.requests,
        connections: STATE.connections,
        groups: [serviceGroup, connectionGroup, requestGroup],
    });
    STATE.services = [];
    STATE.requests = [];
    STATE.connections = [];
    STATE.internetNode.connections = [];
    clearFailureBadges();
}

function restoreServices(savedServices) {
    savedServices.forEach((serviceData) => {
        const position = new THREE.Vector3(
            serviceData.position[0],
            serviceData.position[1],
            serviceData.position[2]
        );

        restoreService(serviceData, position);
    });
    // Power grid (#87): the restore path constructs services outside
    // createService, so the derivation has to be re-run here.
    recomputePower();
}

function restoreConnections(savedConnections, internetConnections) {
    // internetConnections is an array of service IDs (strings), not objects
    internetConnections.forEach((serviceId) => {
        createConnection("internet", serviceId);
    });

    savedConnections.forEach((connData) => {
        createConnection(connData.from, connData.to);
    });
}

export {
    closeSaveModal,
    loadGameState,
    onClickContinueGame,
    onSaveGameFileUpload,
    saveGameState,
    showSaveModal,
};
